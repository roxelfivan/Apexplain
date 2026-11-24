# Settings

Apexplain does **not** ship full-size TTS or LLM weights in git. A clone is tiny. Weights and API keys are fetched or stored **only when you ask**.

Open **Settings** (gear in the top bar, or `Ctrl+.`). Project fields (`title`, `lang`, `size`, `voice`) stay in the **Project** tab (`video.json`). Optional **storyboard.md** feeds Autogenerate when non-empty.

## Autogenerate LLM

Same provider choice as [apeditor](https://github.com/roxelfivan/apeditor):

| Provider | What it is | Size / secret |
|----------|------------|---------------|
| **Local Gemma** | Gemma 2 2B Instruct ONNX on this machine | ~2 GB; `npm run setup:gemma` or **Download from Hugging Face** |
| **Minimax** | Chat Completions HTTPS | API key in `~/.config/apexplain/llm.json` (mode 0600) |

`APEXPLAIN_LLM=mock` keeps stub Autogenerate for tests. Save in Settings stores the provider (and MiniMax key if you pasted one).

## Narration voice

Stored in `~/.config/apexplain/tts.json` (mode 0600). Save in Settings writes both LLM and TTS prefs.

| Field | Engine | Purpose |
|-------|--------|---------|
| **Kokoro voice** + **speed** | English | Fixed speaker id across chunks (`af_heart`, …). Project `video.json` `voice` still overrides when set. |
| **Voice Design brief** | zh-HK Vocello | Describe one speaker; lock gender and require 粵語 (not Mandarin). |
| **seed** | zh-HK Vocello | Fixed integer reused on every chunk / batch so Voice Design does not re-roll gender. |
| **language** | zh-HK Vocello | Usually `chinese` (Vocello has no separate Cantonese code — Cantonese comes from the brief). |
| **delivery** | zh-HK Vocello | Optional delivery instruction (e.g. “Speak 粵語 only”). |

Changing seed/brief invalidates voice cache on the next Make.

## TTS engines (on demand)

English and zh-HK are independent: install either, both, or neither. `make` stays local after setup.

| Engine | Source | Size | Runtime cache | CLI |
|--------|--------|------|---------------|-----|
| **Kokoro-82M** (English) | [Hugging Face](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) (`q8`) | ~88 MB | `~/.cache/apexplain/models/…` | `npm run setup:kokoro` |
| **Vocello** `pro_design_speed` (zh-HK) | [Vocello releases](https://github.com/PowerBeef/Vocello/releases) CLI | ~2.23 GB | `~/Library/Application Support/QwenVoice/models/` | `npm run setup:vocello` |

`npm install` does **not** download those weights. (kokoro-js ships small voice `.bin` files in `node_modules`; that is not the ONNX model.)

### TTS cards

| Control | Kokoro | Vocello |
|---------|--------|---------|
| **Status** | Ready / Not downloaded | Ready / CLI missing / Not downloaded |
| **Last saved** | Last folder you exported | Same |
| **Download from Hugging Face** | Pull ONNX + tokenizer into the cache | — |
| **Download Vocello model** | — | `vocello models install pro_design_speed` (CLI must exist) |
| **Save to Disk** | Copy cache to an absolute folder | Copy the model folder to an absolute path |
| **Load from disk…** | Import a previously saved Kokoro folder (`tokenizer.json` + `onnx/*.onnx`) | Import a saved `pro_design_speed` folder |
| **Clear cached model** | Deletes Apexplain’s Kokoro cache only | Tries `vocello models uninstall`; if that fails, shows the folder to delete yourself |
| External link | Hugging Face model page | Vocello GitHub releases |

Load/save use **absolute paths on this machine** (localhost Node UI). The browser does not upload multi-gigabyte files.

## Environment

| Variable | Effect |
|----------|--------|
| `APEXPLAIN_CACHE` | Override Kokoro/Gemma cache root (default `~/.cache/apexplain`) |
| `APEXPLAIN_ALLOW_HF=1` | Allow Hugging Face during Kokoro/Gemma load (setup / Settings download) |
| `APEXPLAIN_LLM=mock` | Stub Autogenerate (tests) |
| `APEXPLAIN_MINIMAX_API_KEY` | Override the MiniMax key in `llm.json` |
| `APEXPLAIN_VOCELLO` | Path to the Vocello binary |
| `APEXPLAIN_VOCELLO_MODELS` | Override Vocello models directory |
| `APEXPLAIN_VOCELLO_BRIEF` | Override Voice Design brief |
| `APEXPLAIN_VOCELLO_SEED` | Override Vocello design seed |
| `APEXPLAIN_VOCELLO_DELIVERY` | Override Vocello delivery instruction |
| `APEXPLAIN_VOCELLO_LANGUAGE` | Override Vocello language (`chinese` / `auto` / `english`) |
| `APEXPLAIN_KOKORO_VOICE` | Override default Kokoro voice id |
| `APEXPLAIN_KOKORO_SPEED` | Override default Kokoro speed |
| `APEXPLAIN_TTS=mock` | Skip real TTS weights (tests) |
