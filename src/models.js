/**
 * Kokoro TTS loader. Models cache under ~/.cache/apexplain (or APEXPLAIN_CACHE).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const TTS_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const TTS_SAMPLE_RATE = 24000;

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

let ttsPromise = null;

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
      env.allowRemoteModels = process.env.APEXPLAIN_OFFLINE !== '1';
      fs.mkdirSync(env.cacheDir, { recursive: true });
      const dtype = ttsDtype();
      log(`loading Kokoro (${TTS_MODEL}, dtype=${dtype})…`);
      const tts = await KokoroTTS.from_pretrained(TTS_MODEL, {
        dtype,
        device: 'cpu',
        progress_callback: (p) => {
          if (p?.status === 'progress' && p.file && log.update) {
            log.update(`downloading ${p.file}: ${Math.round(p.progress || 0)}%`);
          }
        },
      });
      log(`Kokoro ready (${dtype})`);
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
