# language-spinner

Learn a language while Claude thinks. The "thinking" spinner shows a phrase in your target language with its translation, for example `たべている· I'm eating …`, and changes to a new phrase while a long turn runs.

It ships with a Japanese starter pack (common verbs in five forms: progressive, past progressive, let's, want to, can). Any other language works through your own word file.

## Install

In a Claude Code terminal session:

```
/plugin install language-spinner --marketplace lucaslobasso/language-spinner
```

From a shell: `claude plugin install language-spinner --marketplace lucaslobasso/language-spinner`

## Settings

Open the plugin's rows in the `/config` menu.

| Setting | Default | What it does |
| --- | --- | --- |
| Starter pack | `japanese` | Built-in phrases. `none` uses only your word file. |
| Word file | empty | Absolute path to your own JSON file (below). Your words come first. |
| Display | `same-line` | `same-line` shows phrase and translation together. `alternate` shows the phrase, then its translation. |
| Alternate interval | `3` | Seconds each half stays up in `alternate`. |
| New phrase every | `15` | Switch to a different phrase after this many seconds of one turn. `0` keeps one phrase per turn. |
| Separator | `· ` | Text between phrase and translation in `same-line`. |

## Your own language

Make a JSON file with a list of `text` / `gloss` pairs and put its path in the Word file setting:

```json
[
  { "text": "estoy comiendo", "gloss": "I'm eating" },
  { "text": "quiero dormir", "gloss": "I want to sleep" }
]
```

Entries missing `text` or `gloss` are ignored. If the file can't be read you get one notice and the starter pack is used.

## Adding a pack

A pack is a function returning a list of `{ text, gloss }` in `hooks/packs/`. See `japanese.ts` for one that conjugates verbs, then add the name to the `pack` options in `.claude-plugin/plugin.json` and to `register.tsx`. Pull requests welcome.

## License

MIT
