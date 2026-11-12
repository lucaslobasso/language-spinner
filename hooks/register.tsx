import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Entry, View } from '../types'
import { japanese } from './packs/japanese'

const START: View = { base: 0, offset: 0, phase: 0 }
const view = atom({ plugin: 'language-spinner', key: 'view' } as const, START)

/** The entries of a word file's text; throws when it is not a list of { text, gloss }. */
export function parseWordFile(text: string): Entry[] {
  const data: unknown = JSON.parse(text)

  if (!Array.isArray(data)) {
    throw new Error('expected a JSON list')
  }

  return data.flatMap(row => {
    const { text: t, gloss } = (row ?? {}) as Record<string, unknown>

    return typeof t === 'string' && typeof gloss === 'string' && t !== '' ? [{ text: t, gloss }] : []
  })
}

const HINT = 'alternate | same-line | interval N | rotate N | pack japanese|none | file PATH'

export type Change =
  | { field: string; value: string | number; say: string }
  | { show: true }
  | { error: string }

/** What a `/spinner` argument line asks for: one setting to change, the settings to show, or an error. */
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
      return rest === 'japanese' || rest === 'none'
        ? { field: 'pack', value: rest, say: `Starter pack is now ${rest}.` }
        : { error: '/spinner pack takes japanese or none.' }
    case 'file':
      return { field: 'wordFile', value: rest, say: rest === '' ? 'Word file cleared.' : `Word file is now ${rest}.` }
    default:
      return { error: `Unknown option "${word}". Try: ${HINT}` }
  }
}

const seconds = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback

export const register: Register = (on, options) => {
  const isAlternate = options.display === 'alternate'
  const interval = Math.max(1, seconds(options.intervalSeconds, 5))
  const rotate = seconds(options.rotateSeconds, 20)
  const separator = typeof options.separator === 'string' ? options.separator : '· '
  const wordFile = typeof options.wordFile === 'string' ? options.wordFile.trim() : ''

  let entries: Entry[] = options.pack === 'none' ? [] : japanese()
  let stop: (() => void) | null = null

  on('command.run', { command: 'spinner' }, async ($, e) => {
    const change = parseCommand(e.args ?? '')

    if ('error' in change) {
      return { text: change.error }
    }

    if ('show' in change) {
      const rows = (await $.config.list()).filter(row => row.key.startsWith('language-spinner.'))

      return { text: rows.map(row => `${row.key.slice('language-spinner.'.length)}: ${String(row.value)}`).join('\n') }
    }

    const done = await $.config.set({ key: `language-spinner.${change.field}`, value: change.value })

    return { text: 'deny' in done ? `Could not change that setting: ${String(done.deny)}` : change.say }
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'spinner',
      description: 'Change the language spinner: display, interval, rotation, pack, word file',
      argumentHint: HINT,
    })

    if (wordFile !== '') {
      try {
        const own = parseWordFile(await $.fs.read(wordFile))
        const seen = new Set(own.map(it => it.text))
        // The person's own words come first; the pack fills in what they lack.
        entries = [...own, ...entries.filter(it => !seen.has(it.text))]
      } catch {
        $.ui.toast(`language-spinner: could not read the word file ${wordFile}`)
      }
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    stop?.()
    stop = null

    const base = Math.floor(Math.random() * Math.max(entries.length, 1))
    let shown: View = { base, offset: 0, phase: 0 }
    await update($, view, () => shown)

    if (isAlternate || rotate > 0) {
      let elapsed = 0
      const timer = $.clock.every(1000, () => {
        elapsed += 1
        const offset = rotate > 0 ? Math.floor(elapsed / rotate) : 0
        const phase = isAlternate && Math.floor(elapsed / interval) % 2 === 1 ? 1 : 0

        // Write only when what is drawn changes, so the spinner redraws no more than it must.
        if (offset !== shown.offset || phase !== shown.phase) {
          shown = { base, offset, phase }
          void update($, view, () => shown)
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

    const { base, offset, phase } = await read($, view)
    const entry = entries[(base + offset) % entries.length]

    if (entry === undefined) {
      return next(e)
    }

    const word = isAlternate
      ? phase === 1 ? entry.gloss : entry.text
      : `${entry.text}${separator}${entry.gloss}`

    return next({ ...e, props: { ...e.props, word, suffix: ' …' } })
  })
}
