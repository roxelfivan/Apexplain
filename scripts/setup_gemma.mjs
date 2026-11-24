#!/usr/bin/env node
/**
 * Prefetch Gemma 2 2B Instruct ONNX (~2 GB) into ~/.cache/apexplain for local Autogenerate.
 */
import { loadGemma, probeGemma, GEMMA_MODEL, GEMMA_DTYPE, gemmaOnnxPath } from '../src/llm/gemma.js';

const log = (...args) => console.log(...args);

async function main() {
  process.env.APEXPLAIN_ALLOW_HF = '1';

  console.log('==> Apexplain Local Gemma setup');
  console.log(`    model=${GEMMA_MODEL} dtype=${GEMMA_DTYPE}`);
  console.log(`    target=${gemmaOnnxPath()}`);

  const before = probeGemma();
  if (before.ok) {
    console.log(`==> Already local: ${before.detail}`);
  } else {
    console.log(`==> Missing pieces: ${before.detail}`);
    console.log('==> Downloading once into ~/.cache/apexplain (needs network, ~2 GB)…');
  }

  await loadGemma({ log, allowHf: true });

  const after = probeGemma();
  if (!after.ok) {
    console.error(`==> Still incomplete: ${after.detail}`);
    process.exit(1);
  }
  console.log(`==> Done. ${after.detail}`);
  console.log('    Autogenerate with provider=local-gemma stays local unless APEXPLAIN_ALLOW_HF=1');
}

main().catch((e) => {
  console.error(e?.stack || e);
  process.exit(1);
});
