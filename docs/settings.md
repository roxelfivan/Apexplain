# Settings — TTS models

Apexplain does **not** ship full-size TTS or LLM weights in git. A clone is tiny. Weights are fetched **only when you ask**, independently for English and zh-HK.

The same actions exist in the local UI (**Settings** gear) and on the CLI.

## Engines

| Engine | Source | Size | Runtime cache | CLI |
|--------|--------|------|---------------|-----|
| **Kokoro-82M** (English) | [Hugging Face](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) (`q8`) | ~88 MB | `~/.cache/apexplain/models/…` | `npm run setup:kokoro` |
| **Vocello** `pro_design_speed` (zh-HK) | [Vocello releases](https://github.com/PowerBeef/Vocello/releases) CLI | ~2.23 GB | `~/Library/Application Support/QwenVoice/models/` | `npm run setup:vocello` |

Install **either, both, or neither**. `make` stays local after setup (`APEXPLAIN_ALLOW_HF=1` is only for the Kokoro download step).

`npm install` does **not** download those weights. (kokoro-js ships small voice `.bin` files in `node_modules`; that is not the ONNX model.)

## UI (apeeditor-style model cards)

Open **Settings** (gear next to the Apexplain title). Project fields (`title`, `lang`, `size`, `voice`) stay in the **video.json / Project** tab.

Each card:

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
| `APEXPLAIN_CACHE` | Override Kokoro cache root (default `~/.cache/apexplain`) |
| `APEXPLAIN_ALLOW_HF=1` | Allow Hugging Face during Kokoro load (setup / Settings download) |
| `APEXPLAIN_VOCELLO` | Path to the Vocello binary |
| `APEXPLAIN_VOCELLO_MODELS` | Override Vocello models directory |
| `APEXPLAIN_TTS=mock` | Skip real weights (tests) |
