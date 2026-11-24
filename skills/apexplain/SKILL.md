---
name: apexplain
description: Make a short narrated explainer MP4 from script.md + scenes.json with one make command.
---

# Apexplain

Use when the user wants a short explainer video. Prefer this over a full studio.

## Commands

```bash
npx --yes apexplain init videos/<name> --title "..." --lang en|zh-HK --size 16:9
# edit script.md + scenes.json
npx --yes apexplain make videos/<name> --dry-run
npx --yes apexplain make videos/<name>
# optional local UI (no CLI typing)
npx --yes apexplain ui --port 3847
```

In a checkout: `node bin/apexplain.js …`.

## Language

- `video.json` → `"lang": "en"` (default) or `"zh-HK"`
- **en:** Kokoro English voice (`voice`: e.g. `af_heart`)
- **zh-HK:** Traditional Chinese on-screen; narration via external **Vocello** CLI (`voice`: `vocello`)
  - MVP only: Voice Design + Cantonese brief (no cloud speakers, no custom-mode surface)
  - Needs: Apple Silicon, Vocello CLI + `pro_design_speed` (~2.23 GB), TC font or `APEXPLAIN_FONT`
  - English Kokoro weights: ~88 MB via `npm run setup:kokoro` or UI **Settings** (not stored in git)
  - Weights are on-demand: install Kokoro, Vocello, both, or neither
  - Settings can Save to Disk / Load from a local copy — see `docs/settings.md`

## Files

- `video.json` — title, lang, size `16:9|9:16`, theme `studio|dark`
- `script.md` — `## scene-id`, `[#marker]`, `[pause]`, `{shown|spoken}`
- `scenes.json` — one layout per scene id

## Layouts (only these)

- `title` — `{ "layout":"title", "title":"...", "subtitle":"..." }`
- `steps` / `cards` / `flow` — `{ "layout":"steps", "cue":"sentence", "items":[{ "icon":"globe", "text":"..." }] }`
- `compare` — `{ "layout":"compare", "left":{ "title":"A", "text":"..." }, "right":{ "text":"..." } }`

`cue:"sentence"` reveals item *i* when sentence *i* starts. Optional per-item `at` or `marker`.

Autogenerate uses the UI **Settings** LLM (local Gemma ~2 GB, or MiniMax API key — same choice as [apeditor](https://github.com/roxelfivan/apeditor)). It still picks layouts like explainroo `docs pictures`: **order→steps**, **comparison→compare**, **parts of a whole (hub)→cards**, **cause→flow**, **one big number→title**.

## Script rules

- 45–90s, short sentences, one idea per scene
- Chinese: end sentences with `。！？`
- Never invent numbers; ask once if the topic is empty
- On `make --json` errors, edit the cited `path`; do not read other docs unless the error says `read: apexplain docs <id>`

## Output

`out/video.mp4` and `out/video.srt`. Use `--draft` while iterating.
