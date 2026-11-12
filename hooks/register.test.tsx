import { expect, mock, test } from 'claude-code/testing'

import { conjugate, japanese } from './packs/japanese'
import { createDeck, parseCommand, parseWordFile } from './register'

const texts = (reading: string, group: 'godan' | 'ichidan' | 'irregular', gloss: string) =>
  conjugate(reading, group, gloss).map(it => `${it.text}| ${it.gloss}`)

test('ichidan verbs drop る', () => {
  expect(texts('たべる', 'ichidan', 'eat')).toEqual([
    "たべている| I'm eating",
    'たべていました| I was eating',
    "たべよう| let's eat",
    'たべたい| I want to eat',
    'たべられる| I can eat',
  ])
})

test('each godan ending takes its own te-form', () => {
  const te = (reading: string) => conjugate(reading, 'godan', 'x')[0]?.text

  expect(te('かう')).toBe('かっている')
  expect(te('まつ')).toBe('まっている')
  expect(te('かえる')).toBe('かえっている')
  expect(te('のむ')).toBe('のんでいる')
  expect(te('あそぶ')).toBe('あそんでいる')
  expect(te('しぬ')).toBe('しんでいる')
  expect(te('かく')).toBe('かいている')
  expect(te('およぐ')).toBe('およいでいる')
  expect(te('はなす')).toBe('はなしている')
})

test('いく is the irregular く verb', () => {
  expect(texts('いく', 'godan', 'go').slice(0, 2)).toEqual([
    "いっている| I'm going",
    'いっていました| I was going',
  ])
})

test('godan volitional, want and potential use the o, i and e rows', () => {
  const rest = conjugate('のむ', 'godan', 'drink').slice(2).map(it => it.text)

  expect(rest).toEqual(['のもう', 'のみたい', 'のめる'])
})

test('する and くる are irregular, suru-compounds keep their prefix', () => {
  expect(conjugate('する', 'irregular', 'do').map(it => it.text)).toEqual([
    'している', 'していました', 'しよう', 'したい', 'できる',
  ])
  expect(conjugate('くる', 'irregular', 'come').map(it => it.text)).toEqual([
    'きている', 'きていました', 'こよう', 'きたい', 'こられる',
  ])
  expect(conjugate('べんきょうする', 'irregular', 'study')[0]?.text).toBe('べんきょうしている')
})

test('English -ing follows the usual spelling', () => {
  expect(texts('おきる', 'ichidan', 'wake up')[0]).toBe("おきている| I'm waking up")
  expect(texts('かえる', 'godan', 'go home')[0]).toBe("かえっている| I'm going home")
  expect(texts('およぐ', 'godan', 'swim')[0]).toBe("およいでいる| I'm swimming")
  expect(texts('かく', 'godan', 'write')[0]).toBe("かいている| I'm writing")
})

test('states skip the progressive forms', () => {
  expect(conjugate('ある', 'godan', 'exist').map(it => it.text)).toEqual(['あろう', 'ありたい', 'あれる'])
})

test('the Japanese pack has 5 forms of each of its 21 verbs', () => {
  expect(japanese()).toHaveLength(105)
})

test('a word file keeps valid rows and refuses a non-list', () => {
  expect(parseWordFile('[{"text":"comer","gloss":"to eat"},{"text":"","gloss":"x"},{"gloss":"y"},7]'))
    .toEqual([{ text: 'comer', gloss: 'to eat' }])
  expect(() => parseWordFile('{"text":"comer"}')).toThrow()
  expect(() => parseWordFile('not json')).toThrow()
})

// A fixed sequence, so the shuffles are the same on every run.
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296

  return seed / 4294967296
}

test('the deck deals every word once a round and never the same twice in a row', () => {
  const words = ['a', 'b', 'c', 'd']

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const deck = createDeck(words, seeded(seed))
    const drawn = Array.from({ length: 40 }, () => deck.next() as string)

    for (let round = 0; round < 10; round += 1) {
      expect([...drawn.slice(round * 4, round * 4 + 4)].sort()).toEqual(words)
    }

    for (let i = 1; i < drawn.length; i += 1) {
      expect(drawn[i]).not.toBe(drawn[i - 1])
    }
  }
})

test('the deck copes with one word and with none', () => {
  const one = createDeck(['only'])

  expect([one.next(), one.next()]).toEqual(['only', 'only'])
  expect(createDeck([]).next()).toBeUndefined()
})

test('rows of a word file can share a verb', () => {
  expect(parseWordFile('[{"text":"como","gloss":"I eat","verb":"comer"},{"text":"comes","gloss":"you eat","verb":"comer"}]'))
    .toEqual([
      { text: 'como', gloss: 'I eat', verb: 'comer' },
      { text: 'comes', gloss: 'you eat', verb: 'comer' },
    ])
})

test('/spinner picks one setting to change', () => {
  expect(parseCommand('')).toEqual({ show: true })
  expect(parseCommand('alternate')).toMatchObject({ field: 'display', value: 'alternate' })
  expect(parseCommand('same-line')).toMatchObject({ field: 'display', value: 'same-line' })
  expect(parseCommand('interval 5')).toMatchObject({ field: 'intervalSeconds', value: 5 })
  expect(parseCommand('rotate 30')).toMatchObject({ field: 'rotateSeconds', value: 30 })
  expect(parseCommand('rotate 0')).toMatchObject({ field: 'rotateSeconds', value: 0 })
  expect(parseCommand('pack none')).toMatchObject({ field: 'pack', value: 'none' })
  expect(parseCommand('file C:\\My Words\\es.json')).toMatchObject({ field: 'wordFile', value: 'C:\\My Words\\es.json' })
  expect(parseCommand('file')).toMatchObject({ field: 'wordFile', value: '' })
})

test('/spinner refuses what it cannot use', () => {
  for (const bad of ['interval', 'interval 0', 'interval x', 'rotate -1', 'rotate', 'pack french', 'banana']) {
    expect(parseCommand(bad)).toHaveProperty('error')
  }
})

test('/spinner alternate writes the display row and says so', async ($, on) => {
  const set: unknown[] = []
  on('config.set', (_, e) => {
    set.push({ key: e.key, value: e.value })

    return { value: e.value }
  })
  on('command.register', () => ({ value: { command: 'spinner' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const out = await $.command.run({ command: 'spinner', args: 'rotate 30' })

  expect(set).toEqual([{ key: 'language-spinner.rotateSeconds', value: 30 }])
  expect(out.text).toBe('New phrase every 30s.')
})

const SPINNER = {
  plugin: 'language-spinner',
  component: 'Spinner',
  requestId: 'turn',
  surface: 'terminal',
  props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' },
} as const

test('the spinner shows the phrase and its translation on one line', async ($, on) => {
  // The engine draws whatever props reach it.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{`${e.props.word}${e.props.suffix}`}</Text>
  })

  const ui = await $.ui.mount(SPINNER)

  expect((await ui.find({ type: 'Text' }))?.text).toBe("たべている· I'm eating …")
  await ui.unmount()
})

test('the spinner shows only the phrase first when alternating', { options: { display: 'alternate' } }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{`${e.props.word}${e.props.suffix}`}</Text>
  })

  const ui = await $.ui.mount(SPINNER)

  expect((await ui.find({ type: 'Text' }))?.text).toBe('たべている …')
  await ui.unmount()
})

test("an engine message is left alone", async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{`${e.props.message}`}</Text>
  })

  const ui = await $.ui.mount({ ...SPINNER, props: { ...SPINNER.props, message: 'Compacting' } })

  expect((await ui.find({ type: 'Text' }))?.text).toBe('Compacting')
  await ui.unmount()
})

// The engine beneath the plugin draws whatever props reach it.
const draw = (on: any) =>
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{`${e.props.word}${e.props.suffix}`}</Text>
  })

test('the phrase switches after 20 seconds of one turn', async ($, on) => {
  const clock = mock.clock(on)
  on('prompt.submit', (_, e) => e)
  draw(on)

  await $.prompt.submit({ text: 'hi' })
  const ui = await $.ui.mount(SPINNER)
  const first = (await ui.find({ type: 'Text' }))?.text

  await clock.advance(19000)
  expect((await ui.find({ type: 'Text' }))?.text).toBe(first)

  await clock.advance(1000)
  const second = (await ui.find({ type: 'Text' }))?.text
  expect(second).not.toBe(first)
  expect(second).toContain('·')
  await ui.unmount()
})

test('every switch lands on a different verb, not another form of the same one', async ($, on) => {
  const verbOf = new Map(japanese().map(entry => [entry.text, entry.verb]))
  const clock = mock.clock(on)
  on('prompt.submit', (_, e) => e)
  draw(on)

  await $.prompt.submit({ text: 'hi' })
  const ui = await $.ui.mount(SPINNER)
  const seen: (string | undefined)[] = []

  for (let i = 0; i < 25; i += 1) {
    const shown = (await ui.find({ type: 'Text' }))?.text ?? ''
    seen.push(verbOf.get(shown.split('·')[0] ?? ''))
    await clock.advance(20000)
  }

  expect(seen).not.toContain(undefined)

  for (let i = 1; i < seen.length; i += 1) {
    expect(seen[i]).not.toBe(seen[i - 1])
  }

  expect(new Set(seen).size).toBeGreaterThan(10)
  await ui.unmount()
})

test('a new turn opens on a different verb than the last one shown', async ($, on) => {
  const verbOf = new Map(japanese().map(entry => [entry.text, entry.verb]))
  on('prompt.submit', (_, e) => e)
  draw(on)

  const ui = await $.ui.mount(SPINNER)
  const seen: (string | undefined)[] = []

  for (let i = 0; i < 30; i += 1) {
    await $.prompt.submit({ text: 'hi' })
    const shown = (await ui.find({ type: 'Text' }))?.text ?? ''
    seen.push(verbOf.get(shown.split('·')[0] ?? ''))
  }

  for (let i = 1; i < seen.length; i += 1) {
    expect(seen[i]).not.toBe(seen[i - 1])
  }

  await ui.unmount()
})

test(
  'alternating flips to the translation after the interval',
  { options: { display: 'alternate', rotateSeconds: 0 } },
  async ($, on) => {
    const clock = mock.clock(on)
    on('prompt.submit', (_, e) => e)
    draw(on)

    await $.prompt.submit({ text: 'hi' })
    const ui = await $.ui.mount(SPINNER)
    const phrase = (await ui.find({ type: 'Text' }))?.text

    await clock.advance(4000)
    expect((await ui.find({ type: 'Text' }))?.text).toBe(phrase)

    await clock.advance(1000)
    const gloss = (await ui.find({ type: 'Text' }))?.text
    expect(gloss).not.toBe(phrase)
    expect(gloss).toMatch(/^(I'm|I was|let's|I want|I can)/)

    await clock.advance(5000)
    expect((await ui.find({ type: 'Text' }))?.text).toBe(phrase)
    await ui.unmount()
  },
)
