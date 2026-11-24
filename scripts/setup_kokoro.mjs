#!/usr/bin/env node
/**
 * Prefetch Kokoro-82M ONNX weights into ~/.cache/apexplain for offline English TTS.
 * Voices ship with kokoro-js (npm install); this only pulls the model files.
 */
import { probeKokoro, TTS_MODEL, ttsDtype, kokoroOnnxPath } from '../src/models.js';
import { setupKokoro } from '../src/model-manager.js';

const log = (...args) => console.log(...args);
log.update = (msg) => process.stdout.write(`\r${msg}          `);

async function main() {
  console.log('==> Apexplain Kokoro setup (local cache)');
  console.log(`    model=${TTS_MODEL} dtype=${ttsDtype()}`);
  console.log(`    target=${kokoroOnnxPath()}`);

  const before = probeKokoro();
  if (before.ok) {
    console.log(`==> Already local: ${before.detail}`);
  } else {
    console.log(`==> Missing pieces: ${before.detail}`);
    console.log('==> Downloading once into ~/.cache/apexplain (needs network)…');
  }

  const after = await setupKokoro({ log });
  console.log(`\n==> Done. ${after.detail}`);
  console.log('    Runtime make/ui stay local (no HF) unless APEXPLAIN_ALLOW_HF=1');
  console.log('    Or use UI Settings → Download from Hugging Face');
  console.log('    node bin/apexplain.js doctor');
}

main().catch((e) => {
  console.error(e?.stack || e);
  process.exit(1);
});
