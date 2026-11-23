#!/usr/bin/env bash
# MVP: ensure Vocello CLI + Voice Design model for zh-HK TTS.
# Vocello is an external Mac CLI (not an npm/pip dep).
# https://github.com/PowerBeef/Vocello
set -euo pipefail

echo "==> Apexplain Vocello (zh-HK MVP)"
echo "Install CLI from: https://github.com/PowerBeef/Vocello/releases"
echo

BIN=""
if command -v vocello >/dev/null 2>&1; then
  BIN="$(command -v vocello)"
elif [[ -x "$HOME/.local/opt/vocello/vocello" ]]; then
  BIN="$HOME/.local/opt/vocello/vocello"
elif [[ -x /usr/local/bin/vocello ]]; then
  BIN=/usr/local/bin/vocello
fi

if [[ -z "$BIN" ]]; then
  echo "vocello not found. Install the .pkg, then re-run: npm run setup:vocello"
  exit 1
fi

echo "Found: $BIN"
"$BIN" --version || true
echo "Ensuring model pro_design_speed…"
"$BIN" models install pro_design_speed
echo "Done. Check: node bin/apexplain.js doctor --lang zh-HK"
