#!/usr/bin/env node
/**
 * Prefetch Kokoro-82M ONNX weights into ~/.cache/apexplain for offline English TTS.
 * Voices ship with kokoro-js (npm install); this only pulls the model files.
 */
import { loadTTS, probeKokoro, TTS_MODEL, ttsDtype, kokoroOnnxPath } from '../src/models.js';

const log = (...args) => console.log(...args);
log.update = (msg) => process.stdout.write(`\r${msg}          `);

async function main() {
  // Setup is the only intentional HF download path.
  process.env.APEXPLAIN_ALLOW_HF = '1';
  delete process.env.APEXPLAIN_OFFLINE;

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

  const tts = await loadTTS({ log });
  const r = await tts.generate('Kokoro offline ready.', { voice: 'af_heart' });
  const n = r?.audio?.length ?? 0;
  console.log(`\n==> Synthesized ${n} samples @ ${r.sampling_rate} Hz`);

  const after = probeKokoro();
  if (!after.ok) {
    console.error(`==> Still incomplete: ${after.detail}`);
    process.exit(1);
  }
  console.log(`==> Done. ${after.detail}`);
  console.log('    Runtime make/ui stay local (no HF) unless APEXPLAIN_ALLOW_HF=1');
  console.log('    node bin/apexplain.js doctor');
}

main().catch((e) => {
  console.error(e?.stack || e);
  process.exit(1);
});
