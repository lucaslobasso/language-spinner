# language-spinner

Learn a language while Claude thinks. The "thinking" spinner shows a phrase in your target language with its translation, for example `たべている· I'm eating …`, and moves to a different word while a long turn runs.

The phrases come from a **pack**. One pack, Japanese, ships with the plugin. You can add your own pack for any language: it is just a command that prints a list.

## Install

In a Claude Code terminal session:

```
/plugin install language-spinner --marketplace lucaslobasso/language-spinner
```

From a shell: `claude plugin install language-spinner --marketplace lucaslobasso/language-spinner`

## Commands

Everything is controlled from the prompt with `/spinner`. The same settings are rows in `/config`.

| Command | Does |
| --- | --- |
| `/spinner` | Show the current pack and settings |
| `/spinner packs` | List packs (`*` marks the current one) |
| `/spinner pack NAME` | Switch to a pack; its script runs right away |
| `/spinner refresh` | Run the current pack again and swap in the new list |
| `/spinner add NAME CMD… [--cwd DIR]` | Add a pack of your own (below) |
| `/spinner remove NAME` | Remove a pack you added |
| `/spinner alternate` · `/spinner same-line` | Show the phrase, then its translation · or both together |
| `/spinner interval 5` | Seconds each half stays up when alternating (1 or more) |
| `/spinner rotate 20` | Switch to a different word after 20 seconds (`0` = one word per turn) |

Defaults: same-line display, 5 second interval, a new word every 20 seconds.

The spinner always moves to a different word, never to another form of the same one: every word comes up once before any repeats, and a new turn never opens on the word the last one ended on.

## Your own pack

A pack is any command that prints a JSON list to standard output:

```json
[
  { "text": "estoy comiendo", "gloss": "I'm eating", "verb": "comer" },
  { "text": "quiero comer",   "gloss": "I want to eat", "verb": "comer" },
  { "text": "estoy durmiendo", "gloss": "I'm sleeping", "verb": "dormir" }
]
```

- `text`: the phrase in your language. `gloss`: its translation.
- `verb` (optional): rows that share it are forms of one word, so the spinner never jumps between them. Rows without `verb` each count as their own word.
- Rows missing `text` or `gloss` are ignored. Print UTF-8.

Because it is a command, the pack can be a script that does whatever it likes: read your study notes, pick the words you got wrong, conjugate verbs, call an API. Any language works. A whole pack can be this small:

```python
import json
words = [("comer", "eat"), ("dormir", "sleep"), ("hablar", "talk")]
print(json.dumps([{"text": f"quiero {w}", "gloss": f"I want to {g}", "verb": w} for w, g in words]))
```

Save it as `spanish.py`, then:

```
/spinner add spanish python C:\packs\spanish.py
/spinner pack spanish
```

Use `--cwd DIR` to run the command from a folder (for example a repository your script reads), and quotes around a path with spaces.

When Claude Code starts, the current pack's command runs in the background. Its last good list is shown straight away, so a slow script never holds anything up. If a command fails, times out (15 seconds) or prints nothing usable, you get one notice saying why and the last good list stays. If there is none yet, the built-in Japanese pack is used. Run `/spinner refresh` after your data changes.

## The Japanese pack

Common verbs in hiragana, each in five forms: progressive, past progressive, let's, want to, can. The verb list and the conjugation rules are in `hooks/packs/japanese.ts`.

## Adding a built-in pack

A built-in is a TypeScript module in `hooks/packs/` exporting a function that returns the same list (`{ text, gloss, verb? }[]`), registered by name in `BUILTINS` in `hooks/register.tsx`. See `japanese.ts` for one that conjugates verbs. Pull requests welcome.

## License

MIT
