import { expect, mock, test } from 'claude-code/testing'

import { conjugate, japanese } from './packs/japanese'
import { parseWordFile } from './register'

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

test('the phrase switches after 15 seconds of one turn', async ($, on) => {
  const clock = mock.clock(on)
  on('prompt.submit', (_, e) => e)
  draw(on)

  await $.prompt.submit({ text: 'hi' })
  const ui = await $.ui.mount(SPINNER)
  const first = (await ui.find({ type: 'Text' }))?.text

  await clock.advance(14000)
  expect((await ui.find({ type: 'Text' }))?.text).toBe(first)

  await clock.advance(1000)
  const second = (await ui.find({ type: 'Text' }))?.text
  expect(second).not.toBe(first)
  expect(second).toContain('·')
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

    await clock.advance(3000)
    const gloss = (await ui.find({ type: 'Text' }))?.text
    expect(gloss).not.toBe(phrase)
    expect(gloss).toMatch(/^(I'm|I was|let's|I want|I can)/)

    await clock.advance(3000)
    expect((await ui.find({ type: 'Text' }))?.text).toBe(phrase)
    await ui.unmount()
  },
)
