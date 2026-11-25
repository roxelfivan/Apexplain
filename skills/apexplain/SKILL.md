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
  - Settings **Narration voice**: Kokoro voice/speed (en); Vocello brief/seed/delivery/language (zh-HK) — fixed seed keeps one speaker across chunks
  - Settings can Save to Disk / Load from a local copy — see `docs/settings.md`

## Files

- `video.json` — title, lang, size `16:9|9:16`, theme `studio|dark`, optional `targetSeconds` (15–600; rough finished length), optional `motion` (see below), optional chrome `progress` / `chapters` (see below)
- `storyboard.md` — optional beats / shot list; Autogenerate uses it as the outline base when non-empty
- `script.md` — `## scene-id`, `[#marker]`, `[pause]`; optional `{shown|spoken}` only for TTS pronunciation (e.g. `{API|A P I}`). Do not wrap ordinary words in `{…}`.
- `scenes.json` — one layout per scene id; optional per-scene `motion` overrides `video.json`

## Chrome (optional, off by default)

`video.json` may add a bottom chapter/progress strip. It sits **below** the safe area, so scene content stays clear; burned-in captions lift above it.

```json
"progress": true,
"chapters": ["Intro", "Why it works", "Takeaway"]
```

- `progress` — `true` draws the strip; `false`/absent keeps the plain frame (default)
- `chapters` — optional labels. Without them, chapter names come from `storyboard.md` `##` headings; without those, it is a plain progress bar
- Chapters split the scenes evenly, so 3 labels over 6 scenes = 2 scenes each
- Do not set `progress` in every project — it is chrome, not content

## Motion (prefer explicit)

Motion makes reveals readable: SoftIn fade/slide, staggered list items, draw-on arrows/bars, and count-up stats. Merge order: built-in defaults ← `video.json/motion` ← `scenes.json/<id>/motion`.

```json
"motion": {
  "enabled": true,
  "fade": 0.4,
  "slidePx": 14,
  "drawOn": 0.45,
  "countUp": 0.75,
  "stagger": 0
}
```

- `enabled` — keep `true` for explainers; `false` only for still/export frames
- `fade` — SoftIn opacity duration (seconds, 0–3); prefer `0.35`–`0.55`
- `slidePx` — SoftIn upward settle (px, 0–80); prefer `12`–`20`
- `drawOn` — flow arrows / chart growth (seconds, 0–3); prefer `0.45`–`0.7`
- `countUp` — `stat` number roll-up (seconds, 0–3); prefer `0.8`–`1.1`
- `stagger` — extra delay per item index on top of cues (seconds, 0–1); prefer `0.05`–`0.1` for lists

### Autogenerate: put `motion` on scenes (do not leave blank)

Write a per-scene `"motion"` object on **almost every** layout so timing is visible in `scenes.json` and easy to tweak. Defaults alone are too subtle for a clear presentation.

| Layout | Include `motion` with |
| --- | --- |
| `title` (open/close) | `{ "fade": 0.45, "slidePx": 16 }` |
| `steps` / `cards` / `timeline` / `funnel` | `{ "fade": 0.4, "slidePx": 14, "stagger": 0.07 }` |
| `flow` | `{ "fade": 0.35, "slidePx": 12, "drawOn": 0.5, "stagger": 0.06 }` |
| `compare` | `{ "fade": 0.4, "slidePx": 14, "stagger": 0.08 }` (with `cue:"sentence"`) |
| `stat` / `quote` | `{ "fade": 0.45, "slidePx": 16, "countUp": 1.0 }` (countUp only affects `stat`) |
| `chart` | `{ "fade": 0.35, "drawOn": 0.6, "stagger": 0.08 }` |

Keep values inside the ranges above. Prefer clearer motion over minimal/default; do not set `enabled: false` unless asked.

## Layouts (only these)

- `title` — `{ "layout":"title", "title":"...", "subtitle":"..." }` (optional `"clipart"`)
- `steps` / `cards` / `flow` — `{ "layout":"steps", "cue":"sentence", "items":[{ "icon":"globe", "clipart":"db", "text":"..." }] }`
- `compare` — `{ "layout":"compare", "cue":"sentence", "left":{ "title":"A", "text":"...", "clipart":"doc" }, "right":{ "text":"..." } }` (sides SoftIn in order when cued)
- `stat` — `{ "layout":"stat", "value":"365.24", "unit":"days", "caption":"...", "clipart":"globe-wire" }`
- `chart` — `{ "layout":"chart", "kind":"bar"|"line"|"pie", "title":"...", "series":[{ "label":"A", "value":10 }], "highlight":0 }`
- `timeline` — `{ "layout":"timeline", "cue":"sentence", "items":[{ "text":"1900 · start" }, { "text":"Today" }] }`
- `quote` — `{ "layout":"quote", "text":"Keep hot answers close", "attrib":"design rule", "clipart":"book" }`
- `funnel` — `{ "layout":"funnel", "cue":"sentence", "items":[{ "text":"All requests" }, { "text":"Cache check" }, { "text":"Hits" }] }` (wide→narrow stages)

Optional `"clipart"` names: `doc`, `db`, `server`, `funnel`, `nodes`, `stack`, `magnifier`, `shield-block`, `book`, `cloud`, `gear`, `globe-wire`, `phone`, `person`, `cycle`, `bars`. Prefer clipart for mechanisms; Lucide `icon` for small accents.

`cue:"sentence"` reveals item/series *i* when sentence *i* starts. Optional per-item `at` or `marker`.

### Pick layout by what the beat *shows* (quick decision)

Autogenerate outline gives `relation` + `layoutHints` — **not a forced layout**. For each middle scene, choose the one layout that best fits that beat’s content (from `layoutHints` or this table). Do **not** round-robin or default to `cards`. Pair a fitting `"clipart"` when it clarifies the mechanism.

| Beat shows (visual relation) | Prefer layout | Clipart hint |
| --- | --- | --- |
| Ordered steps / procedure | `steps` | `gear`, `cycle` |
| Cause→effect, pipeline, merge | `flow` | `nodes`, `stack` |
| Filter / narrow / screen-out | `funnel` | `funnel` on first item |
| Two sides, tradeoff, lookalike-vs-different | `compare` | `doc` / `shield-block` per side |
| Parts / traits of one subject | `cards` | subject metaphor (`db`, `server`, …) |
| One big number / magnitude | `stat` | `bars` |
| 2–5 comparable numbers or a trend | `chart` | — |
| History / eras / time axis | `timeline` | — |
| Key line, source, memorable takeaway | `quote` | `book` |
| Open / close hook | `title` (close may use `quote`) | hero clipart |

At most one middle scene should be `cards` unless the beat truly is “parts of a whole”. Prefer `chart` when the beat has 2–5 comparable numbers.

Autogenerate (UI **Settings** LLM: local Gemma ~2 GB, or MiniMax API key — same choice as [apeditor](https://github.com/roxelfivan/apeditor)) **loads this skill** into the model system prompt when writing `script.md` + `scenes.json`.

## Script rules

- Size speech to `video.json` `targetSeconds` when set (else ~45–90s): more middle scenes and more spoken sentences for longer targets. Prefer short clear sentences, one idea per scene — not a short video when the target is long. Match on-screen item counts to sentence counts
- Chinese: end sentences with `。！？`
- Never invent numbers; ask once if the topic is empty
- On `make --json` errors, edit the cited `path`; do not read other docs unless the error says `read: apexplain docs <id>`

## Output

`out/video.mp4` and `out/video.srt`. Use `--draft` while iterating.
