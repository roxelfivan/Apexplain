# Apexplain

Agent-run explainer videos, designed so coding agents spend fewer tokens than a full studio like [explainroo](https://github.com/vincentsch/explainroo).

One small skill → `script.md` + `scenes.json` → `apexplain make` → `out/video.mp4`.

Plan: [docs/apexplain-token-mvp.md](docs/apexplain-token-mvp.md) · Agent skill: [skills/apexplain/SKILL.md](skills/apexplain/SKILL.md) · [Changelog](CHANGELOG.md)

## Requirements

| Need | Notes |
|------|--------|
| **Node.js** | `>= 20.11` |
| **macOS Apple Silicon** | Required for zh-HK (Vocello). English-only works on any platform Node supports. |
| **Disk (models)** | English: ~88 MB. zh-HK: ~2.2 GB once (see below). |
| **Traditional Chinese font** | For zh-HK on-screen text (PingFang HK / Songti TC / Noto Sans TC), or set `APEXPLAIN_FONT=/path/to/font.otf` |

No Python / pip TTS stack. FFmpeg ships via `ffmpeg-static` (npm).

## Dependencies

### npm (from this repo)

```bash
npm install
```

Runtime packages: `kokoro-js`, `@huggingface/transformers`, `@napi-rs/canvas`, `ffmpeg-static`, `lucide-static`, `opencc-js` (Simplified → Traditional HK for zh-HK content).

### TTS models (downloaded separately)

| Lang | Engine | What to install | Approx. size | Where it lands |
|------|--------|-----------------|--------------|----------------|
| **en** | [Kokoro-82M](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) (`q8`) | `npm run setup:kokoro` | **~88 MB** | `~/.cache/apexplain/models/…/model_quantized.onnx` |
| **zh-HK** | [Vocello](https://github.com/PowerBeef/Vocello) CLI → Qwen3-TTS Voice Design | Vocello `.pkg` + `npm run setup:vocello` | **~2.23 GB** model (`pro_design_speed`); CLI binary ~62 MB | `~/Library/Application Support/QwenVoice/models/…` |

Vocello is an **external Mac CLI** (not an npm or pip package). Apexplain only shells out to `vocello generate` (MVP: Voice Design + Cantonese brief). Local Vocello has no Rocky/Kiki Cantonese speakers.

## Local-first runtime

After setup, **make / UI / preview / voice** use only on-disk assets — no Hugging Face, no Wikipedia, no cloud TTS.

| Path | Network? |
|------|----------|
| `make`, `preview`, `ui` Make video | **No** — Kokoro from `~/.cache/apexplain`, Vocello from local MLX models, ffmpeg/canvas/fonts from disk |
| Autogenerate | **No** by default (local outline stub). Opt in: `APEXPLAIN_ALLOW_NET=1` for Wikipedia |
| `npm run setup:kokoro` | **Once** — downloads ~88 MB into the local cache |
| `npm run setup:vocello` | **Once** — Vocello downloads ~2.23 GB Voice Design weights |

Env knobs:

| Variable | Effect |
|----------|--------|
| `APEXPLAIN_ALLOW_HF=1` | Allow Hugging Face download at Kokoro load (setup script sets this) |
| `APEXPLAIN_ALLOW_NET=1` | Allow Wikipedia during Autogenerate |
| `APEXPLAIN_OFFLINE=1` | Force stub autogenerate; still requires local TTS weights |
| `APEXPLAIN_TTS=mock` | No models (tests) |

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

Optional env: `APEXPLAIN_VOCELLO=/path/to/vocello`, `APEXPLAIN_VOCELLO_BRIEF=…`.

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
