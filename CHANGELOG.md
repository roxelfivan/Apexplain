# Changelog

## 0.0.7 — 2026-11-25

### Added
- **Phase 3 chrome**: opt-in bottom chapter/progress strip — `video.json` → `"progress": true` plus optional `"chapters": [...]` (labels fall back to `storyboard.md` `##` headings)
- Project UI: **Progress strip** checkbox + **Chapters** field next to Target length
- Stronger burned-in captions: rounded scrim, hairline edge, soft shadow; captions lift above the chrome strip
- Track the visual richness phase plan in-repo (`.cursor/plans/`)

### Changed
- Chrome stays **off by default** — it is structure, not content

## 0.0.6 — 2026-11-24

### Added
- **Clipart** registry for mechanism glyphs (`db`, `funnel`, `nodes`, `stack`, …) alongside Lucide `icon` accents
- **Layouts**: `stat`, `chart` (bar/line/pie), `timeline`, `quote`, `funnel` — plus richer `steps` / `cards` / `flow` / `compare`
- **Motion** on scenes and `video.json`: SoftIn fade/slide, stagger, draw-on, count-up (`src/motion.js`)
- **`targetSeconds`** (15–600) in templates, Project UI, CLI `--target-seconds`, and Autogenerate length budgeting
- Autogenerate scales middle-beat count and per-beat `minSentences` / `minWords` from target length; skill-driven system prompt
- Charts demo example (`examples/charts-demo`)

### Changed
- Autogenerate picks layout by beat content (`layoutHints` + skill decision table), not cards-by-default / round-robin
- Local Gemma / MiniMax output token budgets scale with `targetSeconds` so longer scripts are not truncated
- Project **Target length** box is the Autogenerate source of truth (carried from Create into the Project tab)
- Lucide icon allowlist expanded (~200 names) with aliases for common model synonyms (`train`→`train-front`, `route`, travel/food/money icons, …)
- Dense item layouts: strip per-item clipart when lists are long; flow/timeline shrink or stack to stay in the safe area
- Skill + docs: size speech to `targetSeconds`, always emit per-scene `motion`, prefer clipart for mechanisms

### Fixed
- Stale `"targetSeconds": "{{targetSeconds}}"` leftovers leaving the Target length field empty
- Make failures on unknown Autogenerate icons (e.g. `route`) and overflow from dense flow/timeline scenes with item clipart

## 0.0.5 — 2026-11-24

### Added
- Settings **Narration voice**: Kokoro voice/speed (en) and Vocello Voice Design brief/seed/delivery/language (zh-HK) in `~/.config/apexplain/tts.json`
- Optional **storyboard.md** project tab — Autogenerate uses it as the outline base when non-empty
- Starter templates ship `storyboard.md` (en + zh-HK)

### Changed
- zh-HK Vocello uses a fixed design **seed** (and shared warm-engine batch) so chunks keep one voice; default brief locks Cantonese
- Autogenerate JSON parsing strips model reasoning tags and picks the best `{ script, scenes }` object from noisy replies
- Docs / skill / README cover Narration voice env overrides and storyboard-driven Autogenerate

### Fixed
- Vocello Voice Design no longer re-rolls a different speaker per chunk when seed/brief stay constant

## 0.0.4 — 2026-11-24

### Added
- UI **Settings** (gear): **Local Gemma** or **MiniMax** for Autogenerate, plus on-demand **Kokoro** / **Vocello** TTS download, Save to Disk, Load from a local copy
- [docs/settings.md](docs/settings.md) — LLM + TTS weights are **not** in git; clone stays small
- Autogenerate is an LLM step: Gemma on-device or MiniMax Chat Completions; JSON `{ script, scenes }` validated against Apexplain schema
- `npm run setup:gemma`; settings file `~/.config/apexplain/llm.json` (0600)

### Changed
- Local web UI is mobile-first: project drawer, sticky Make/Save bar, larger tap targets, visible focus, and Settings as a phone sheet
- Autogenerate no longer writes scripts from Wikipedia (outline intent is unchanged; copy comes from the Settings LLM)
- `APEXPLAIN_LLM=mock` keeps stub Autogenerate for tests
- README / skill: English vs zh-HK TTS installs are independent; `video.json` tab labeled Project

## 0.0.3 — 2026-11-24

### Added
- Topic-sensible **Autogenerate** outlines (intent + subject beats); Wikipedia supplies facts, not TOC scene titles
- Live Output progress for **zh-HK**: one line per Vocello chunk (async spawn + SSE flush), matching English

### Changed
- Autogenerate may use Wikipedia by default for on-topic copy (`APEXPLAIN_OFFLINE=1` forces stubs); make/TTS stay local
- Stronger English/Chinese subject extraction and page relevance (avoids off-topic wiki hits)
- Offline stubs name the subject instead of generic filler

### Fixed
- English Autogenerate scripts that felt “standard” (Etymology/Taxonomy) instead of explainer-shaped
- Chinese make Output buffering until a whole scene finished

## 0.0.2 — 2026-11-24

### Added
- **zh-HK** language path: Traditional Chinese (OpenCC cn→hk), CJK fonts, starter template
- **Vocello** local TTS for zh-HK (Voice Design + Cantonese brief; external Mac CLI, ~2.23 GB model)
- **Local web UI** (`apexplain ui`) with project create/delete, Autogenerate, live Output status, streaming make logs
- Topic-shaped **Autogenerate** (intent + outline; Wikipedia optional via `APEXPLAIN_ALLOW_NET=1`)
- `npm run setup:kokoro` / `npm run setup:vocello`, `requirements.txt`, expanded README (deps, install, local-first)

### Changed
- Runtime is **local-first**: no Hugging Face or Wikipedia unless opted in (`APEXPLAIN_ALLOW_HF` / `APEXPLAIN_ALLOW_NET`)
- Doctor reports local policy + Vocello / CJK readiness
- Skill + docs updated for EN/zh-HK and model sizes (~88 MB Kokoro, ~2.23 GB Vocello)

### Removed
- Kitten / Ming TTS experiments and Python TTS dependency path

## 0.0.1 — 2026-11-23

- Phase 1–6 MVP CLI: `script.md` + `scenes.json` → `make` → MP4
- Kokoro English TTS, skill, leap-years example, golden tests
