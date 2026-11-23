---
name: apexplain
description: Make a short narrated explainer MP4 from script.md + scenes.json with one make command.
---

# Apexplain

Use when the user wants a short explainer video. Prefer this over a full studio.

## Commands

```bash
npx --yes apexplain init videos/<name> --title "..." --size 16:9
# edit script.md + scenes.json
npx --yes apexplain make videos/<name> --dry-run
npx --yes apexplain make videos/<name>
```

In a checkout: `node bin/apexplain.js …`.

## Files

- `video.json` — title, size `16:9|9:16`, theme `studio|dark`
- `script.md` — `## scene-id`, `[#marker]`, `[pause]`, `{shown|spoken}`
- `scenes.json` — one layout per scene id

## Layouts (only these)

- `title` — `{ "layout":"title", "title":"...", "subtitle":"..." }`
- `steps` / `cards` / `flow` — `{ "layout":"steps", "cue":"sentence", "items":[{ "icon":"globe", "text":"..." }] }`
- `compare` — `{ "layout":"compare", "left":{ "title":"A", "text":"..." }, "right":{ "text":"..." } }`

`cue:"sentence"` reveals item *i* when sentence *i* starts. Optional per-item `at` (sentence index) or `marker`.

## Script rules

- 45–90s, 8–18 word sentences, one idea per scene
- Never invent numbers; ask once if the topic is empty
- On `make --json` errors, edit the cited `path`; do not read other docs unless the error says `read: apexplain docs <id>`

## Output

`out/video.mp4` and `out/video.srt`. Use `--draft` for a faster encode while iterating.
