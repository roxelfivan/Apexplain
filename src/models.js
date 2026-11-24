/**
 * Kokoro TTS loader. Models cache under ~/.cache/apexplain (or APEXPLAIN_CACHE).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './paths.js';

export const TTS_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const TTS_SAMPLE_RATE = 24000;

/** transformers.js ONNX filename for each Kokoro dtype */
const ONNX_BY_DTYPE = {
  fp32: 'model.onnx',
  fp16: 'model_fp16.onnx',
  q8: 'model_quantized.onnx',
  q4: 'model_q4.onnx',
  q4f16: 'model_q4f16.onnx',
};

export function cacheRoot() {
  return process.env.APEXPLAIN_CACHE || path.join(os.homedir(), '.cache', 'apexplain');
}

export function ttsDtype() {
  const d = process.env.APEXPLAIN_TTS_DTYPE || 'q8';
  if (!['fp32', 'fp16', 'q8', 'q4', 'q4f16'].includes(d)) {
    throw new Error(`APEXPLAIN_TTS_DTYPE must be fp32, fp16, q8, q4 or q4f16, not "${d}"`);
  }
  return d;
}

/** Local HF cache dir for the Kokoro ONNX model. */
export function kokoroModelDir() {
  return path.join(cacheRoot(), 'models', ...TTS_MODEL.split('/'));
}

/** Expected ONNX weights path for the active dtype. */
export function kokoroOnnxPath(dtype = ttsDtype()) {
  const file = ONNX_BY_DTYPE[dtype] || ONNX_BY_DTYPE.q8;
  return path.join(kokoroModelDir(), 'onnx', file);
}

/**
 * Probe whether English Kokoro weights + voices are present for offline use.
 */
export function probeKokoro() {
  const dtype = ttsDtype();
  const checks = [];
  const voices = path.join(ROOT, 'node_modules', 'kokoro-js', 'voices', 'af_heart.bin');
  const onnx = kokoroOnnxPath(dtype);
  const tokenizer = path.join(kokoroModelDir(), 'tokenizer.json');

  if (!fs.existsSync(path.join(ROOT, 'node_modules', 'kokoro-js', 'package.json'))) {
    checks.push('kokoro-js not installed (npm install)');
  }
  if (!fs.existsSync(voices)) checks.push('missing bundled voice af_heart.bin');
  if (!fs.existsSync(onnx)) checks.push(`missing ONNX weights (${dtype}): ${onnx}`);
  if (!fs.existsSync(tokenizer)) checks.push(`missing tokenizer at ${tokenizer}`);

  const ok = checks.length === 0;
  return {
    ok,
    detail: ok
      ? `offline ready (dtype=${dtype}, cache=${cacheRoot()})`
      : checks.join('; '),
    dtype,
    onnx,
    cache: cacheRoot(),
    fix: ok ? undefined : 'npm run setup:kokoro',
  };
}

let ttsPromise = null;

/** Drop the cached Kokoro engine (after setup, import, or cache clear). */
export function resetTTS() {
  ttsPromise = null;
}

/**
 * Load KokoroTTS. With APEXPLAIN_TTS=mock, returns a tiny sine-wave synthesizer
 * (for tests; no model download).
 */
export function loadTTS({ log = () => {} } = {}) {
  if (process.env.APEXPLAIN_TTS === 'mock') {
    return Promise.resolve(mockTTS());
  }
  if (!ttsPromise) {
    ttsPromise = (async () => {
      const { KokoroTTS } = await import('kokoro-js');
      const { env } = await import('@huggingface/transformers');
      env.cacheDir = path.join(cacheRoot(), 'models');
      // Local-first: never hit Hugging Face during make/ui unless opted in.
      // One-shot download: `APEXPLAIN_ALLOW_HF=1 npm run setup:kokoro`.
      const local = probeKokoro().ok;
      const allowHf = process.env.APEXPLAIN_ALLOW_HF === '1';
      env.allowRemoteModels = allowHf;
      env.allowLocalModels = true;
      // Avoid accidental Hub telemetry / remote lookups when offline-ready.
      if (!allowHf) {
        env.useFSCache = true;
        env.useBrowserCache = false;
      }
      fs.mkdirSync(env.cacheDir, { recursive: true });
      const dtype = ttsDtype();
      if (!local && !allowHf) {
        throw new Error(
          `Kokoro weights missing at ${kokoroOnnxPath(dtype)}. Run: npm run setup:kokoro`,
        );
      }
      log(
        `loading Kokoro (${TTS_MODEL}, dtype=${dtype}${allowHf ? ', may download' : ', local only'})…`,
      );
      const tts = await KokoroTTS.from_pretrained(TTS_MODEL, {
        dtype,
        device: 'cpu',
        progress_callback: (p) => {
          if (p?.status === 'progress' && p.file && log.update) {
            log.update(`downloading ${p.file}: ${Math.round(p.progress || 0)}%`);
          }
        },
      });
      log(`Kokoro ready (${dtype}, local)`);
      return tts;
    })();
    ttsPromise.catch(() => {
      ttsPromise = null;
    });
  }
  return ttsPromise;
}

function mockTTS() {
  return {
    async generate(text, { speed = 1 } = {}) {
      const sr = TTS_SAMPLE_RATE;
      // ~12.7 letters/sec at speed 0.9 → scale for mock duration.
      const letters = (String(text).match(/\p{L}|\p{N}/gu) || []).length || 1;
      const seconds = Math.max(0.15, letters / (12.7 * (speed / 0.9) ** 0.65));
      const n = Math.round(seconds * sr);
      const audio = new Float32Array(n);
      const freq = 220;
      for (let i = 0; i < n; i++) {
        const envAmp = Math.min(1, i / (sr * 0.02), (n - i) / (sr * 0.05));
        audio[i] = Math.sin((2 * Math.PI * freq * i) / sr) * 0.2 * envAmp;
      }
      return { audio, sampling_rate: sr };
    },
  };
}

/** Resolve package entry for diagnostics. */
export function packageUrl(name) {
  return pathToFileURL(path.join(process.cwd(), 'node_modules', name, 'package.json')).href;
}
