import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Entry, View } from '../types'
import { japanese } from './packs/japanese'

const START: View = { index: 0, phase: 0 }
// The shape tag declines a value an earlier version stored (it held base and offset).
const view = atom({ plugin: 'language-spinner', key: 'view' } as const, START, { shape: 'view-2' })

/** The packs that ship with the plugin: a name and a function returning the list. */
const BUILTINS: Record<string, () => Entry[]> = { japanese }
const DEFAULT_PACK = 'japanese'
const NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/i
const PACK_TIMEOUT_MS = 15000

/** A pack of the user's own: a command whose standard output is the list. */
export type PackSpec = { argv: string[]; cwd?: string }
type Packs = Record<string, PackSpec>

/**
 * The entries a pack printed; throws when it is not a JSON list of { text, gloss }.
 * A row may also carry `verb`: rows sharing one are forms of a single word.
 */
export function parseEntries(text: string): Entry[] {
  const data: unknown = JSON.parse(text)

  if (!Array.isArray(data)) {
    throw new Error('expected a JSON list')
  }

  return data.flatMap(row => {
    const { text: t, gloss, verb } = (row ?? {}) as Record<string, unknown>

    if (typeof t !== 'string' || typeof gloss !== 'string' || t === '') {
      return []
    }

    return [typeof verb === 'string' && verb !== '' ? { text: t, gloss, verb } : { text: t, gloss }]
  })
}

/** What the store held under `packs`, keeping only well-formed entries. */
function cleanPacks(value: unknown): Packs {
  const out: Packs = {}

  if (typeof value !== 'object' || value === null) {
    return out
  }

  for (const [name, spec] of Object.entries(value)) {
    const { argv, cwd } = (spec ?? {}) as Record<string, unknown>

    if (Array.isArray(argv) && argv.length > 0 && argv.every(a => typeof a === 'string')) {
      out[name] = typeof cwd === 'string' && cwd !== '' ? { argv: argv as string[], cwd } : { argv: argv as string[] }
    }
  }

  return out
}

/**
 * Hands out the groups in a shuffled order, every group once before any repeats, and never
 * the same group twice in a row, even where one round ends and the next begins.
 */
export function createDeck(groups: readonly string[], random: () => number = Math.random) {
  let bag: string[] = []
  let last: string | undefined

  return {
    next(): string | undefined {
      if (groups.length === 0) {
        return undefined
      }

      if (bag.length === 0) {
        bag = [...groups]

        for (let i = bag.length - 1; i > 0; i -= 1) {
          const j = Math.floor(random() * (i + 1))
          ;[bag[i], bag[j]] = [bag[j] as string, bag[i] as string]
        }

        // The next draw comes off the end: keep it from repeating the last one drawn.
        if (bag.length > 1 && bag[bag.length - 1] === last) {
          ;[bag[0], bag[bag.length - 1]] = [bag[bag.length - 1] as string, bag[0] as string]
        }
      }

      last = bag.pop()

      return last
    },
  }
}

const groupOf = (entry: Entry) => entry.verb ?? entry.text

const HINT =
  'alternate | same-line | interval N | rotate N | pack NAME | packs | refresh | add NAME CMD… [--cwd DIR] | remove NAME'

export type Change =
  | { field: string; value: string | number; say: string }
  | { show: true }
  | { pack: string }
  | { packs: true }
  | { refresh: true }
  | { add: { name: string; spec: PackSpec } }
  | { remove: string }
  | { error: string }

/** Words and "quoted phrases" of a command line, the quotes dropped; no escapes, so paths keep their backslashes. */
export function tokenize(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map(m => m[1] ?? m[2] ?? '')
}

/** What a `/spinner` argument line asks for: a setting to change, a pack to run, or an error. */
export function parseCommand(args: string): Change {
  const [, word = '', rest = ''] = args.trim().match(/^(\S+)\s*(.*)$/) ?? []

  switch (word) {
    case '':
      return { show: true }
    case 'alternate':
    case 'same-line':
      return { field: 'display', value: word, say: `Display is now ${word}.` }
    case 'interval':
    case 'rotate': {
      const n = Number(rest)
      const min = word === 'interval' ? 1 : 0

      if (rest === '' || !Number.isFinite(n) || n < min) {
        return { error: `/spinner ${word} takes a number of seconds, ${min} or more.` }
      }

      return word === 'interval'
        ? { field: 'intervalSeconds', value: n, say: `Alternate interval is now ${n}s.` }
        : { field: 'rotateSeconds', value: n, say: n === 0 ? 'One phrase per turn.' : `New phrase every ${n}s.` }
    }
    case 'pack':
      return NAME.test(rest) ? { pack: rest } : { error: '/spinner pack takes a pack name (see /spinner packs).' }
    case 'packs':
      return { packs: true }
    case 'refresh':
      return { refresh: true }
    case 'remove':
      return NAME.test(rest) ? { remove: rest } : { error: '/spinner remove takes a pack name (see /spinner packs).' }
    case 'add': {
      const [name = '', ...tokens] = tokenize(rest)
      const at = tokens.indexOf('--cwd')
      const cwd = at === -1 ? undefined : tokens[at + 1]
      const argv = at === -1 ? tokens : tokens.filter((_, i) => i !== at && i !== at + 1)

      if (!NAME.test(name) || argv.length === 0 || (at !== -1 && !cwd)) {
        return { error: '/spinner add takes a name and a command: /spinner add NAME CMD… [--cwd DIR]' }
      }

      return { add: { name, spec: cwd ? { argv, cwd } : { argv } } }
    }
    default:
      return { error: `Unknown option "${word}". Try: ${HINT}` }
  }
}

const seconds = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback

const why = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function readPacks($: EngineInterface): Promise<Packs> {
  return cleanPacks(await $.store.get('packs'))
}

/** Runs a pack and returns its list; throws with the reason when it can't. */
async function runPack($: EngineInterface, name: string): Promise<Entry[]> {
  const builtin = BUILTINS[name]

  if (builtin !== undefined) {
    return builtin()
  }

  const spec = (await readPacks($))[name]

  if (spec === undefined) {
    throw new Error(`there is no pack named "${name}"`)
  }

  let result
  try {
    result = await $.process.run(spec.argv, {
      timeoutMs: PACK_TIMEOUT_MS,
      env: { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
      ...(spec.cwd ? { cwd: spec.cwd } : {}),
    })
  } catch (error) {
    throw new Error(`could not run it (${why(error)})`)
  }

  if (result.exitCode !== 0) {
    throw new Error(`it exited with ${result.exitCode}: ${result.stderr.trim().split('\n').pop() ?? ''}`)
  }

  let list
  try {
    list = parseEntries(result.stdout)
  } catch (error) {
    throw new Error(`its output is not a list of phrases (${why(error)})`)
  }

  if (list.length === 0) {
    throw new Error('it printed no phrases')
  }

  return list
}

/** Runs a pack and hands its list to `apply` (a command pack's list is also cached); the reason it failed, or null. */
async function refresh($: EngineInterface, name: string, apply: (list: Entry[]) => void): Promise<string | null> {
  try {
    const list = await runPack($, name)
    apply(list)

    if (BUILTINS[name] === undefined) {
      await $.store.set(`cache:${name}`, list)
    }

    return null
  } catch (error) {
    return why(error)
  }
}

export const register: Register = (on, options) => {
  const isAlternate = options.display === 'alternate'
  const interval = Math.max(1, seconds(options.intervalSeconds, 5))
  const rotate = seconds(options.rotateSeconds, 20)
  const separator = typeof options.separator === 'string' ? options.separator : '· '
  const packName = typeof options.pack === 'string' && options.pack.trim() !== '' ? options.pack.trim() : DEFAULT_PACK

  let entries: Entry[] = []
  let byGroup = new Map<string, number[]>()
  let deck = createDeck([])
  let stop: (() => void) | null = null

  // Whenever the entries change: regroup them by word and deal a fresh deck of words.
  const load = (next: Entry[]) => {
    entries = next
    byGroup = new Map()
    entries.forEach((entry, index) => byGroup.set(groupOf(entry), [...(byGroup.get(groupOf(entry)) ?? []), index]))
    deck = createDeck([...byGroup.keys()])
  }

  // The next word from the deck, as one of its forms picked at random.
  const draw = (): number => {
    const forms = byGroup.get(deck.next() ?? '') ?? []

    return forms[Math.floor(Math.random() * forms.length)] ?? 0
  }

  load(BUILTINS[packName]?.() ?? [])

  on('command.run', { command: 'spinner' }, async ($, e) => {
    const change = parseCommand(e.args ?? '')

    if ('error' in change) {
      return { text: change.error }
    }

    if ('show' in change) {
      const rows = (await $.config.list()).filter(row => row.key.startsWith('language-spinner.'))
      const settings = rows.map(row => `${row.key.slice('language-spinner.'.length)}: ${String(row.value)}`)

      return { text: [`words: ${byGroup.size}, phrases: ${entries.length}`, ...settings].join('\n') }
    }

    if ('packs' in change) {
      const names = [...Object.keys(BUILTINS), ...Object.keys(await readPacks($))]

      return { text: names.map(n => `${n === packName ? '*' : ' '} ${n}${BUILTINS[n] ? ' (built-in)' : ''}`).join('\n') }
    }

    if ('refresh' in change) {
      const failure = await refresh($, packName, load)

      return {
        text: failure === null
          ? `Refreshed "${packName}": ${byGroup.size} words, ${entries.length} phrases.`
          : `Pack "${packName}" failed: ${failure}`,
      }
    }

    if ('add' in change) {
      const { name, spec } = change.add

      if (BUILTINS[name] !== undefined) {
        return { text: `"${name}" is a built-in pack; pick another name.` }
      }

      await $.store.set('packs', { ...(await readPacks($)), [name]: spec })

      return { text: `Added pack "${name}". Switch to it with /spinner pack ${name}.` }
    }

    if ('remove' in change) {
      const packs = await readPacks($)
      const name = change.remove

      if (BUILTINS[name] !== undefined) {
        return { text: `"${name}" is a built-in pack and can't be removed.` }
      }

      if (packs[name] === undefined) {
        return { text: `There is no pack named "${name}".` }
      }

      if (name === packName) {
        return { text: `"${name}" is the current pack; switch to another first.` }
      }

      const { [name]: _gone, ...kept } = packs
      await $.store.set('packs', kept)

      return { text: `Removed pack "${name}".` }
    }

    if ('pack' in change) {
      const name = change.pack

      if (BUILTINS[name] === undefined && (await readPacks($))[name] === undefined) {
        return { text: `There is no pack named "${name}". Add one with /spinner add, or see /spinner packs.` }
      }

      const done = await $.config.set({ key: 'language-spinner.pack', value: name })

      return { text: 'deny' in done ? `Could not switch pack: ${String(done.deny)}` : `Switched to "${name}".` }
    }

    const done = await $.config.set({ key: `language-spinner.${change.field}`, value: change.value })

    return { text: 'deny' in done ? `Could not change that setting: ${String(done.deny)}` : change.say }
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'spinner',
      description: 'Change the language spinner: display, timing, packs',
      argumentHint: HINT,
    })

    // A command pack shows its last good list at once; the script then runs in the
    // background, so a slow or broken one never delays the session.
    if (BUILTINS[packName] === undefined) {
      const cached = await $.store.get(`cache:${packName}`)

      if (Array.isArray(cached)) {
        load(parseEntries(JSON.stringify(cached)))
      }
    }

    const started = await next(e)

    void (async () => {
      const failure = await refresh($, packName, load)

      if (failure !== null) {
        $.ui.toast(`language-spinner: pack "${packName}" failed: ${failure}`)

        if (entries.length === 0) {
          load(japanese())
        }
      }
    })()

    return started
  })

  on('prompt.submit', async ($, e, next) => {
    stop?.()
    stop = null

    // Each turn opens on a different word from the last one shown.
    let shown: View = { index: draw(), phase: 0 }
    await update($, view, () => shown)

    if (isAlternate || rotate > 0) {
      let elapsed = 0
      let switchedAt = 0
      const timer = $.clock.every(1000, () => {
        elapsed += 1
        let now = shown

        if (rotate > 0 && elapsed - switchedAt >= rotate) {
          // A different word, not another form of this one, shown from its phrase first.
          switchedAt = elapsed
          now = { index: draw(), phase: 0 }
        } else if (isAlternate) {
          const phase = Math.floor((elapsed - switchedAt) / interval) % 2 === 1 ? 1 : 0
          now = phase === shown.phase ? shown : { ...shown, phase }
        }

        // Write only when what is drawn changes, so the spinner redraws no more than it must.
        if (now !== shown) {
          shown = now
          void update($, view, () => now)
        }
      })
      stop = () => timer.cancel()
    }

    return next(e)
  }).catch((_$, e, next) => next(e))

  on('turn.complete', ($, e, next) => {
    stop?.()
    stop = null

    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    // A message is the engine saying something specific; leave it alone.
    if (entries.length === 0 || e.props.message !== null) {
      return next(e)
    }

    const { index, phase } = await read($, view)
    const entry = entries[index] ?? entries[0]

    if (entry === undefined) {
      return next(e)
    }

    const word = isAlternate
      ? phase === 1 ? entry.gloss : entry.text
      : `${entry.text}${separator}${entry.gloss}`

    return next({ ...e, props: { ...e.props, word, suffix: ' …' } })
  })
}
