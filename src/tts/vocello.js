/**
 * zh-HK TTS via Vocello CLI (external binary — no npm/Python deps).
 * MVP: Voice Design + Cantonese brief → WAV. Requires Apple Silicon +
 * `vocello models install pro_design_speed`.
 * Generate uses async spawn so UI/SSE can stream one log line per chunk
 * (same as English Kokoro), instead of blocking on spawnSync.
 * https://github.com/PowerBeef/Vocello
 */
import { spawn, spawnSync } from 'node:child_process';
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

/** Sync helper for doctor/probe only (short commands). */
function runVocelloSync(bin, args, timeout = 30000) {
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

/**
 * Async Vocello run — does not block the Node event loop, so SSE log lines
 * can flush between Chinese chunks the same way English Kokoro does.
 */
function runVocelloAsync(bin, args, timeout = 600000, { onStdout, onStderr } = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      resolve({
        status: null,
        stdout,
        stderr: stderr || `vocello timed out after ${timeout}ms`,
        error: new Error('timeout'),
      });
    }, timeout);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      stdout += d;
      if (stdout.length > 8 * 1024 * 1024) stdout = stdout.slice(-4 * 1024 * 1024);
      if (onStdout) onStdout(d);
    });
    child.stderr.on('data', (d) => {
      stderr += d;
      if (stderr.length > 8 * 1024 * 1024) stderr = stderr.slice(-4 * 1024 * 1024);
      if (onStderr) onStderr(d);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status: null, stdout, stderr, error });
    });
    child.on('close', (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, stdout, stderr, error: null });
    });
  });
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
  const ver = runVocelloSync(bin, ['--version'], 15000);
  if (ver.error || ver.status !== 0) {
    return {
      ok: false,
      detail: `vocello failed (${ver.stderr || ver.error?.message || 'exit ' + ver.status})`,
      fix: 'Reinstall Vocello CLI from https://github.com/PowerBeef/Vocello/releases',
      bin,
    };
  }
  const version = (ver.stdout || ver.stderr || '').trim().split('\n')[0].slice(0, 80);

  const models = runVocelloSync(bin, ['models', 'list', '--json'], 30000);
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
    modelDir: vocelloDesignModelDir(),
  };
}

export function vocelloBinPath() {
  return whichVocello();
}

/** Directory that holds Vocello Voice Design weights. */
export function vocelloModelsRoot() {
  if (process.env.APEXPLAIN_VOCELLO_MODELS) {
    return path.resolve(expandHome(process.env.APEXPLAIN_VOCELLO_MODELS));
  }
  return path.join(os.homedir(), 'Library', 'Application Support', 'QwenVoice', 'models');
}

export function vocelloDesignModelDir() {
  return path.join(vocelloModelsRoot(), VOCELLO_DESIGN_MODEL);
}

function expandHome(p) {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function logVocelloStream(log, chunk) {
  const text = String(chunk || '');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t) log(t);
  }
}

/**
 * Pull `pro_design_speed` via the Vocello CLI (large; needs network).
 */
export async function installVocelloDesignModel({ log = () => {} } = {}) {
  const bin = whichVocello();
  if (!bin) {
    throw new ApexError('vocello CLI not found', {
      code: 'vocello_setup',
      rule: 'cli',
      hint: 'Install Vocello CLI: https://github.com/PowerBeef/Vocello/releases',
    });
  }
  log(`Found: ${bin}`);
  log(`Installing ${VOCELLO_DESIGN_MODEL}…`);
  const r = await runVocelloAsync(bin, ['models', 'install', VOCELLO_DESIGN_MODEL], 30 * 60 * 1000, {
    onStdout: (d) => logVocelloStream(log, d),
    onStderr: (d) => logVocelloStream(log, d),
  });
  if (r.status !== 0) {
    throw new ApexError(
      `vocello models install failed: ${(r.stderr || r.stdout || r.error?.message || `exit ${r.status}`).slice(0, 400)}`,
      {
        code: 'vocello_setup',
        rule: 'install',
        hint: `vocello models install ${VOCELLO_DESIGN_MODEL}`,
      },
    );
  }
  const probe = probeVocello();
  if (!probe.ok) {
    throw new ApexError(`Vocello still not ready: ${probe.detail}`, {
      code: 'vocello_setup',
      rule: 'probe',
      hint: probe.fix,
    });
  }
  return probe;
}

/**
 * Best-effort uninstall. If the CLI has no uninstall command, callers should
 * show the model path instead of deleting files blindly.
 */
export async function uninstallVocelloDesignModel({ log = () => {} } = {}) {
  const bin = whichVocello();
  if (!bin) {
    throw new ApexError('vocello CLI not found', {
      code: 'vocello_clear',
      rule: 'cli',
      hint: `Remove ${vocelloDesignModelDir()} yourself if the model was installed.`,
    });
  }
  log(`Trying: ${bin} models uninstall ${VOCELLO_DESIGN_MODEL}`);
  const r = await runVocelloAsync(bin, ['models', 'uninstall', VOCELLO_DESIGN_MODEL], 120000, {
    onStdout: (d) => logVocelloStream(log, d),
    onStderr: (d) => logVocelloStream(log, d),
  });
  if (r.status !== 0) {
    throw new ApexError(
      `Vocello has no uninstall (or it failed): ${(r.stderr || r.stdout || `exit ${r.status}`).slice(0, 300)}`,
      {
        code: 'vocello_clear',
        rule: 'uninstall',
        hint: `Delete the model folder yourself: ${vocelloDesignModelDir()}`,
      },
    );
  }
  return probeVocello();
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
      const r = await runVocelloAsync(
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
          // Keep each Apexplain chunk as one take (matches EN per-chunk progress).
          '--long-form',
          'never',
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
      // Yield so mock zh-HK also streams chunk logs like real async TTS.
      await new Promise((r) => setImmediate(r));
      return { audio, sampling_rate: sr };
    },
    async close() {},
  };
}
