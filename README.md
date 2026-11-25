# Apexplain

Agent-run explainer videos, designed so coding agents spend fewer tokens than a full studio like [explainroo](https://github.com/vincentsch/explainroo).

One small skill → `script.md` + `scenes.json` → `apexplain make` → `out/video.mp4`.

Plan: [docs/apexplain-token-mvp.md](docs/apexplain-token-mvp.md) · Agent skill: [skills/apexplain/SKILL.md](skills/apexplain/SKILL.md) · [Changelog](CHANGELOG.md)

## Requirements

| Need | Notes |
|------|--------|
| **Node.js** | `>= 20.11` |
| **macOS Apple Silicon** | Required for zh-HK (Vocello). English-only works on any platform Node supports. |
| **Disk (models)** | **Not in git.** English: ~88 MB on demand. zh-HK: ~2.2 GB on demand (see below). |
| **Traditional Chinese font** | For zh-HK on-screen text (PingFang HK / Songti TC / Noto Sans TC), or set `APEXPLAIN_FONT=/path/to/font.otf` |

No Python / pip TTS stack. FFmpeg ships via `ffmpeg-static` (npm).

## Dependencies

### npm (from this repo)

```bash
npm install
```

Runtime packages: `kokoro-js`, `@huggingface/transformers`, `@napi-rs/canvas`, `ffmpeg-static`, `lucide-static`, `opencc-js` (Simplified → Traditional HK for zh-HK content).

### TTS models (on demand — not in this GitHub repo)

Clone / `npm install` does **not** download full TTS weights. English and zh-HK are independent: install either, both, or neither.

| Lang | Engine | What to install | Approx. size | Where it lands |
|------|--------|-----------------|--------------|----------------|
| **en** | [Kokoro-82M](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) (`q8`) | `npm run setup:kokoro` **or UI Settings → Download from Hugging Face** | **~88 MB** | `~/.cache/apexplain/models/…/model_quantized.onnx` |
| **zh-HK** | [Vocello](https://github.com/PowerBeef/Vocello) CLI → Qwen3-TTS Voice Design | Vocello `.pkg` + `npm run setup:vocello` **or UI Settings → Download Vocello model** | **~2.23 GB** model (`pro_design_speed`); CLI binary ~62 MB | `~/Library/Application Support/QwenVoice/models/…` |

Save/load local copies from **Settings** (gear) so you can skip Hugging Face / Vocello on another machine. See [docs/settings.md](docs/settings.md).

Vocello is an **external Mac CLI** (not an npm or pip package). Apexplain only shells out to `vocello generate` (MVP: Voice Design + Cantonese brief). Local Vocello has no Rocky/Kiki Cantonese speakers.

## Local-first runtime

After setup, **make / UI / preview / voice** use only on-disk assets — no Hugging Face, no cloud TTS.

| Path | Network? |
|------|----------|
| `make`, `preview`, `ui` Make video | **No** — Kokoro from `~/.cache/apexplain`, Vocello from local MLX models, ffmpeg/canvas/fonts from disk |
| Autogenerate | **Local Gemma** (after `npm run setup:gemma` / Settings download) or **MiniMax** HTTPS if you pasted a key. `APEXPLAIN_LLM=mock` forces stubs |
| `npm run setup:kokoro` or Settings → Download from Hugging Face | **Once** — downloads ~88 MB Kokoro into the local cache |
| `npm run setup:gemma` | **Once** — downloads Gemma 2 2B Instruct ONNX (~2 GB) for Autogenerate |
| `npm run setup:vocello` or Settings → Download Vocello model | **Once** — Vocello downloads ~2.23 GB Voice Design weights |

Env knobs:

| Variable | Effect |
|----------|--------|
| `APEXPLAIN_ALLOW_HF=1` | Allow Hugging Face download at Kokoro/Gemma load (setup scripts set this) |
| `APEXPLAIN_LLM=mock` | Stub Autogenerate (tests); no Gemma/MiniMax |
| `APEXPLAIN_MINIMAX_API_KEY` | Overrides the MiniMax key stored in `~/.config/apexplain/llm.json` |
| `APEXPLAIN_TTS=mock` | No TTS models (tests) |

## Installation

### 1. Clone and install Node deps

```bash
git clone https://github.com/roxelfivan/Apexplain.git
cd Apexplain
npm install
```

### 2. English TTS (required for `lang=en`)

```bash
npm run setup:kokoro    # ~88 MB once (network); afterward make stays local
```

### 3. Chinese TTS (optional — only for `lang=zh-HK`)

1. Install the Vocello CLI from [Vocello releases](https://github.com/PowerBeef/Vocello/releases) (`Vocello-macos26-cli.pkg`, Apple Silicon / macOS 26+).
2. Pull the Voice Design model (~2.2 GB, once):

```bash
npm run setup:vocello   # runs: vocello models install pro_design_speed
node bin/apexplain.js doctor --lang zh-HK
```

Optional env: `APEXPLAIN_VOCELLO=/path/to/vocello`, `APEXPLAIN_VOCELLO_BRIEF=…`, `APEXPLAIN_VOCELLO_SEED=…`, `APEXPLAIN_VOCELLO_DELIVERY=…`, `APEXPLAIN_VOCELLO_LANGUAGE=chinese`. Voice Design brief/seed/delivery are also editable in **Settings → Narration voice** (`~/.config/apexplain/tts.json`).

### 4. Verify

```bash
node bin/apexplain.js doctor          # English
node bin/apexplain.js doctor --lang zh-HK
```

## Quick start

```bash
node bin/apexplain.js init videos/demo --title "My topic"
# edit script.md + scenes.json
node bin/apexplain.js make videos/demo --dry-run
node bin/apexplain.js make videos/demo
```

### Local web UI

```bash
node bin/apexplain.js ui --port 3847
# open http://127.0.0.1:3847
```

Projects live under `videos/` (override with `APEXPLAIN_VIDEOS`).

**Settings** (gear) — same idea as [apeditor](https://github.com/roxelfivan/apeditor). Full reference: [docs/settings.md](docs/settings.md).

- **Local Model (require around 2gb disk space)** — Gemma 2 2B Instruct ONNX for Autogenerate (`npm run setup:gemma` or Download in Settings). No API key.
- **Minimax** — paste your API key (stored in `~/.config/apexplain/llm.json`, mode 0600). Default endpoint `https://api.minimax.io/v1`, model `MiniMax-M2.7`.
- **TTS** — download Kokoro and/or Vocello on demand, Save to Disk, or Load from a previously saved folder. Project `video.json` is title/lang/size/voice only.

### Chinese project

```bash
node bin/apexplain.js init videos/demo-zh --lang zh-HK --title "閏年"
node bin/apexplain.js make videos/demo-zh
```

### Useful flags

```bash
node bin/apexplain.js make videos/demo --draft       # faster encode while iterating
node bin/apexplain.js make videos/demo --voice-only  # TTS only
node bin/apexplain.js preview videos/demo            # still PNGs in build/stills/
```

`APEXPLAIN_TTS=mock` skips real TTS (tests). Example project: `examples/leap-years`.

### Optional chrome

Add a bottom chapter/progress strip (off by default):

```json
{ "progress": true, "chapters": ["Intro", "Why it works", "Takeaway"] }
```

The strip sits below the safe area, so scene content stays clear; burned-in captions lift above it.
Leave `chapters` out and names come from `storyboard.md` `##` headings.
