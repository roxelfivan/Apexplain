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
import { DEFAULT_VOCELLO_BRIEF, loadTtsSettings } from './config.js';

export const VOCELLO_ENGINE = 'vocello';
export const VOCELLO_VOICE = 'vocello';
export const VOCELLO_DESIGN_MODEL = 'pro_design_speed';

const DEFAULT_BRIEF = DEFAULT_VOCELLO_BRIEF;

function resolveVocelloDesign(opts = {}) {
  const cfg = opts.settings || loadTtsSettings();
  const v = cfg.vocello || {};
  return {
    brief: String(v.voiceBrief || DEFAULT_BRIEF).trim() || DEFAULT_BRIEF,
    language: String(v.language || 'chinese').trim() || 'chinese',
    seed: Number.isFinite(Number(v.seed)) ? Math.trunc(Number(v.seed)) : 42,
    delivery: typeof v.delivery === 'string' ? v.delivery.trim() : '',
  };
}

function wavFromFile(tmp) {
  const wav = readWav(tmp);
  const mono = resampleMono(wav.samples, wav.sampleRate, TTS_SAMPLE_RATE);
  return { audio: mono, sampling_rate: TTS_SAMPLE_RATE };
}

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

function designArgv({ text, out, brief, language, seed, delivery }) {
  const args = [
    'generate',
    '--mode',
    'design',
    '--text',
    String(text),
    '--language',
    language,
    '--voice-brief',
    brief,
    '--seed',
    String(seed),
    '--out',
    out,
    '--json',
    '--no-input',
    // Keep each Apexplain chunk as one take (matches EN per-chunk progress).
    '--long-form',
    'never',
    '--wait-for-engine',
  ];
  if (delivery) {
    args.push('--delivery', delivery);
  }
  return args;
}

function failSynthesize(bin, r, tmp) {
  const env = parseJsonEnvelope(r.stdout);
  const msg =
    env?.error?.message ||
    env?.message ||
    r.stderr?.trim() ||
    r.stdout?.trim() ||
    `vocello exit ${r.status}`;
  if (tmp && !fs.existsSync(tmp)) {
    /* include missing out in message context */
  }
  throw new ApexError(`Vocello synthesize failed: ${String(msg).slice(0, 400)}`, {
    code: 'vocello_tts',
    rule: 'synthesize',
    hint: `Check: ${bin} models list && ${bin} models install ${VOCELLO_DESIGN_MODEL}`,
  });
}

/**
 * @param {{ log?: Function, settings?: object }} [opts]
 */
export function createVocelloWorker({ log = () => {}, settings } = {}) {
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
  const design = resolveVocelloDesign({ settings });
  const { brief, language, seed, delivery } = design;

  log(`loading Vocello (design, ${language}, seed=${seed})…`);

  async function generateOne(text) {
    const tmp = path.join(
      os.tmpdir(),
      `apexplain-vocello-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`,
    );
    const r = await runVocelloAsync(
      bin,
      designArgv({ text, out: tmp, brief, language, seed, delivery }),
      600000,
    );
    if (r.status !== 0 || !fs.existsSync(tmp)) {
      failSynthesize(bin, r, tmp);
    }
    try {
      return wavFromFile(tmp);
    } finally {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Multi-chunk on one warm engine via `vocello run --requests` (shared seed/brief/language).
   * Falls back to sequential generateOne on failure.
   */
  async function generateMany(texts) {
    const list = (texts || []).map((t) => String(t));
    if (!list.length) return [];
    if (list.length === 1) return [await generateOne(list[0])];

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apexplain-vocello-batch-'));
    const reqPath = path.join(workDir, 'requests.jsonl');
    const outs = list.map((_, i) => path.join(workDir, `chunk-${i}.wav`));
    const lines = list.map((text, i) => {
      const req = {
        mode: 'design',
        text,
        language,
        voiceBrief: brief,
        seed,
        out: outs[i],
        longForm: 'never',
      };
      if (delivery) req.delivery = delivery;
      return JSON.stringify(req);
    });
    fs.writeFileSync(reqPath, lines.join('\n') + '\n');

    try {
      log(`vocello run: ${list.length} chunks (seed=${seed})…`);
      const r = await runVocelloAsync(
        bin,
        ['run', '--requests', reqPath, '--json', '--no-input', '--wait-for-engine'],
        600000 * Math.min(list.length, 8),
      );
      const env = parseJsonEnvelope(r.stdout);
      const results = env?.result?.results || env?.results;
      const allOk =
        r.status === 0 &&
        Array.isArray(results) &&
        results.length === list.length &&
        results.every((row) => row?.ok !== false) &&
        outs.every((p) => fs.existsSync(p));

      if (!allOk) {
        log('vocello run batch incomplete — falling back to per-chunk generate');
        const out = [];
        for (const text of list) {
          out.push(await generateOne(text));
        }
        return out;
      }

      return outs.map((p) => wavFromFile(p));
    } finally {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  return {
    engine: VOCELLO_ENGINE,
    design,
    async generate(text) {
      return generateOne(text);
    },
    async generateMany(texts) {
      return generateMany(texts);
    },
    async close() {},
  };
}

/** Exported for tests — build argv for a single design take. */
export function vocelloDesignArgvForTests(opts) {
  return designArgv(opts);
}

function createMockVocello() {
  const synth = async (text) => {
    const sr = TTS_SAMPLE_RATE;
    const letters = (String(text).match(/[\p{L}\p{N}]/gu) || []).length || 1;
    const seconds = Math.max(0.2, letters / 4.6);
    const n = Math.round(seconds * sr);
    const audio = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const envAmp = Math.min(1, i / (sr * 0.02), (n - i) / (sr * 0.05));
      audio[i] = Math.sin((2 * Math.PI * 220 * i) / sr) * 0.18 * envAmp;
    }
    await new Promise((r) => setImmediate(r));
    return { audio, sampling_rate: sr };
  };
  return {
    engine: 'mock-vocello',
    design: resolveVocelloDesign(),
    async generate(text) {
      return synth(text);
    },
    async generateMany(texts) {
      const out = [];
      for (const t of texts || []) out.push(await synth(t));
      return out;
    },
    async close() {},
  };
}
