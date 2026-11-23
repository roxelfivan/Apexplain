/**
 * zh-HK TTS via Vocello CLI (external binary — no npm/Python deps).
 * MVP: Voice Design + Cantonese brief → WAV. Requires Apple Silicon +
 * `vocello models install pro_design_speed`.
 * https://github.com/PowerBeef/Vocello
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ApexError } from '../errors.js';
import { TTS_SAMPLE_RATE } from '../models.js';
import { readWav, resampleMono } from '../wav.js';

export const VOCELLO_ENGINE = 'vocello';
export const VOCELLO_VOICE = 'vocello';
export const VOCELLO_DESIGN_MODEL = 'pro_design_speed';

const DEFAULT_BRIEF =
  'A clear Hong Kong Cantonese narrator, warm and natural, speaking fluent 粵語';

function whichVocello() {
  const forced = process.env.APEXPLAIN_VOCELLO || process.env.VOCELLO_BIN;
  if (forced && fs.existsSync(forced)) return forced;
  const r = spawnSync('which', ['vocello'], { encoding: 'utf8' });
  const p = (r.stdout || '').trim().split('\n')[0];
  if (r.status === 0 && p && fs.existsSync(p)) return p;
  const home = os.homedir();
  for (const f of [
    path.join(home, '.local', 'bin', 'vocello'),
    path.join(home, '.local', 'opt', 'vocello', 'vocello'),
    '/usr/local/bin/vocello',
  ]) {
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function runVocello(bin, args, timeout = 300000) {
  const r = spawnSync(bin, args, {
    encoding: 'utf8',
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env },
  });
  return {
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    error: r.error,
  };
}

function parseJsonEnvelope(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      /* continue */
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Probe Vocello install for doctor / UI. */
export function probeVocello() {
  const bin = whichVocello();
  if (!bin) {
    return {
      ok: false,
      detail: 'vocello CLI not found',
      fix: 'Install Vocello CLI: https://github.com/PowerBeef/Vocello/releases — then: vocello models install pro_design_speed',
    };
  }
  const ver = runVocello(bin, ['--version'], 15000);
  if (ver.error || ver.status !== 0) {
    return {
      ok: false,
      detail: `vocello failed (${ver.stderr || ver.error?.message || 'exit ' + ver.status})`,
      fix: 'Reinstall Vocello CLI from https://github.com/PowerBeef/Vocello/releases',
      bin,
    };
  }
  const version = (ver.stdout || ver.stderr || '').trim().split('\n')[0].slice(0, 80);

  const models = runVocello(bin, ['models', 'list', '--json'], 30000);
  const body = parseJsonEnvelope(models.stdout);
  const list = body?.result?.models || body?.models || [];
  const entry = Array.isArray(list)
    ? list.find((m) => m && m.id === VOCELLO_DESIGN_MODEL)
    : null;
  const modelReady = models.status === 0 && entry && entry.installed === true;

  if (!modelReady) {
    return {
      ok: false,
      detail: `${bin} (${version}); ${VOCELLO_DESIGN_MODEL} not installed`,
      fix: `vocello models install ${VOCELLO_DESIGN_MODEL}`,
      bin,
      version,
    };
  }

  return {
    ok: true,
    detail: `Vocello ${version} · design · ${VOCELLO_DESIGN_MODEL}`,
    bin,
    version,
  };
}

export function createVocelloWorker({ log = () => {} } = {}) {
  if (process.env.APEXPLAIN_TTS === 'mock') {
    return createMockVocello();
  }

  const probe = probeVocello();
  if (!probe.ok) {
    throw new ApexError(`Vocello TTS not ready: ${probe.detail}`, {
      code: 'vocello_tts',
      rule: 'setup',
      hint: probe.fix || `Install Vocello CLI + vocello models install ${VOCELLO_DESIGN_MODEL}`,
    });
  }

  const bin = probe.bin;
  const brief = process.env.APEXPLAIN_VOCELLO_BRIEF || DEFAULT_BRIEF;
  const language = process.env.APEXPLAIN_VOCELLO_LANGUAGE || 'chinese';

  log(`loading Vocello (design, ${language})…`);

  return {
    engine: VOCELLO_ENGINE,
    async generate(text) {
      const tmp = path.join(
        os.tmpdir(),
        `apexplain-vocello-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`,
      );
      const r = runVocello(
        bin,
        [
          'generate',
          '--mode',
          'design',
          '--text',
          String(text),
          '--language',
          language,
          '--voice-brief',
          brief,
          '--out',
          tmp,
          '--json',
          '--no-input',
          '--wait-for-engine',
        ],
        600000,
      );
      if (r.status !== 0 || !fs.existsSync(tmp)) {
        const env = parseJsonEnvelope(r.stdout);
        const msg =
          env?.error?.message ||
          env?.message ||
          r.stderr?.trim() ||
          r.stdout?.trim() ||
          `vocello exit ${r.status}`;
        throw new ApexError(`Vocello synthesize failed: ${String(msg).slice(0, 400)}`, {
          code: 'vocello_tts',
          rule: 'synthesize',
          hint: `Check: ${bin} models list && ${bin} models install ${VOCELLO_DESIGN_MODEL}`,
        });
      }

      try {
        const wav = readWav(tmp);
        const mono = resampleMono(wav.samples, wav.sampleRate, TTS_SAMPLE_RATE);
        return { audio: mono, sampling_rate: TTS_SAMPLE_RATE };
      } finally {
        try {
          fs.rmSync(tmp, { force: true });
        } catch {
          /* ignore */
        }
      }
    },
    async close() {},
  };
}

function createMockVocello() {
  return {
    engine: 'mock-vocello',
    async generate(text) {
      const sr = TTS_SAMPLE_RATE;
      const letters = (String(text).match(/[\p{L}\p{N}]/gu) || []).length || 1;
      const seconds = Math.max(0.2, letters / 4.6);
      const n = Math.round(seconds * sr);
      const audio = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const envAmp = Math.min(1, i / (sr * 0.02), (n - i) / (sr * 0.05));
        audio[i] = Math.sin((2 * Math.PI * 220 * i) / sr) * 0.18 * envAmp;
      }
      return { audio, sampling_rate: sr };
    },
    async close() {},
  };
}
