/**
 * One spinner phrase: `text` in the language being learned, `gloss` its translation.
 * `verb` names the word the phrase is a form of; phrases sharing a `verb` count as one word,
 * so a switch never moves from one form of a word to another form of it.
 */
export type Entry = { text: string; gloss: string; verb?: string }

/** What the spinner shows now: the entry's index, and which half when alternating. */
export type View = { index: number; phase: 0 | 1 }

declare module 'claude-code' {
  interface PluginState {
    'language-spinner': { view: View }
  }
}
