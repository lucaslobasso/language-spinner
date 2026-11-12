/** One spinner phrase: `text` in the language being learned, `gloss` its translation. */
export type Entry = { text: string; gloss: string }

/** What the spinner shows now: the turn's starting entry, how far it has rotated, and which half. */
export type View = { base: number; offset: number; phase: 0 | 1 }

declare module 'claude-code' {
  interface PluginState {
    'language-spinner': { view: View }
  }
}
