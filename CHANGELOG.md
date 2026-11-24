# Changelog

## 0.0.4 — 2026-11-24

### Added
- UI **Settings** page (gear): **Local Gemma** (~2 GB ONNX) or **MiniMax API key**, following [apeditor](https://github.com/roxelfivan/apeditor)
- Autogenerate is an LLM step: Gemma on-device or MiniMax Chat Completions; JSON `{ script, scenes }` validated against Apexplain schema
- `npm run setup:gemma`; settings file `~/.config/apexplain/llm.json` (0600)

### Changed
- Local web UI is mobile-first: project drawer, sticky Make/Save bar, larger tap targets, visible focus, and Settings as a phone sheet
- Autogenerate no longer writes scripts from Wikipedia (outline intent is unchanged; copy comes from the Settings LLM)
- `APEXPLAIN_LLM=mock` keeps stub Autogenerate for tests

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
