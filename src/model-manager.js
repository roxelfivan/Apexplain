/**
 * On-demand TTS weights: Hugging Face Kokoro + Vocello CLI.
 * Never bundled in git — copy/import local trees, or download once.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ApexError } from './errors.js';
import {
  cacheRoot,
  kokoroModelDir,
  kokoroOnnxPath,
  loadTTS,
  probeKokoro,
  resetTTS,
  ttsDtype,
  TTS_MODEL,
} from './models.js';
import {
  installVocelloDesignModel,
  probeVocello,
  uninstallVocelloDesignModel,
  vocelloDesignModelDir,
  vocelloModelsRoot,
  VOCELLO_DESIGN_MODEL,
} from './tts/vocello.js';

export const KOKORO_HF_PAGE = `https://huggingface.co/${TTS_MODEL}`;
export const VOCELLO_RELEASES = 'https://github.com/PowerBeef/Vocello/releases';
export const KOKORO_SIZE_LABEL = '~88 MB';
export const VOCELLO_SIZE_LABEL = '~2.23 GB';

export function modelsMetaPath() {
  return path.join(cacheRoot(), 'models-meta.json');
}

export function readModelsMeta() {
  const file = modelsMetaPath();
  try {
    if (!fs.existsSync(file)) return { kokoro: null, vocello: null };
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      kokoro: raw.kokoro || null,
      vocello: raw.vocello || null,
    };
  } catch {
    return { kokoro: null, vocello: null };
  }
}

export function writeLastSave(engine, lastSave) {
  const meta = readModelsMeta();
  meta[engine] = lastSave;
  fs.mkdirSync(path.dirname(modelsMetaPath()), { recursive: true });
  fs.writeFileSync(modelsMetaPath(), JSON.stringify(meta, null, 2) + '\n');
  return lastSave;
}

export function expandUserPath(p) {
  if (p == null) return '';
  const s = String(p).trim();
  if (!s) return '';
  if (s === '~') return os.homedir();
  if (s.startsWith('~/')) return path.join(os.homedir(), s.slice(2));
  return s;
}

export function resolveUserPath(p, { mustExist = false } = {}) {
  const expanded = expandUserPath(p);
  if (!expanded) {
    throw new ApexError('path is required', { code: 'bad_path', rule: 'required', path: 'path' });
  }
  const abs = path.resolve(expanded);
  if (!path.isAbsolute(abs)) {
    throw new ApexError('path must be absolute', { code: 'bad_path', rule: 'absolute', path: abs });
  }
  if (mustExist && !fs.existsSync(abs)) {
    throw new ApexError(`path not found: ${abs}`, { code: 'bad_path', rule: 'exists', path: abs });
  }
  return abs;
}

export function dirSizeBytes(root) {
  if (!root || !fs.existsSync(root)) return 0;
  const st = fs.statSync(root);
  if (st.isFile()) return st.size;
  let total = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      try {
        if (e.isDirectory()) stack.push(full);
        else if (e.isFile()) total += fs.statSync(full).size;
      } catch {
        /* ignore */
      }
    }
  }
  return total;
}

function copyTree(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function lastSaveRecord(absPath) {
  return {
    fileName: path.basename(absPath),
    path: absPath,
    savedAt: Date.now(),
  };
}

const KOKORO_ONNX_FILES = [
  'model_quantized.onnx',
  'model.onnx',
  'model_fp16.onnx',
  'model_q4.onnx',
  'model_q4f16.onnx',
];

function hasKokoroFiles(dir) {
  const tokenizer = path.join(dir, 'tokenizer.json');
  if (!fs.existsSync(tokenizer)) return false;
  const onnxDir = path.join(dir, 'onnx');
  if (!fs.existsSync(onnxDir)) return false;
  return KOKORO_ONNX_FILES.some((f) => fs.existsSync(path.join(onnxDir, f)));
}

/**
 * Resolve a folder that contains tokenizer.json + onnx/*.onnx
 * (the HF cache layout, or an exported copy).
 */
export function findKokoroLayout(dir) {
  const abs = resolveUserPath(dir, { mustExist: true });
  const st = fs.statSync(abs);
  if (!st.isDirectory()) {
    throw new ApexError('Kokoro import path must be a directory', {
      code: 'bad_path',
      rule: 'directory',
      path: abs,
    });
  }
  const candidates = [
    abs,
    path.join(abs, ...TTS_MODEL.split('/')),
    path.join(abs, 'models', ...TTS_MODEL.split('/')),
    path.join(abs, TTS_MODEL.split('/')[1]),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && hasKokoroFiles(c)) return c;
  }
  throw new ApexError(
    `No Kokoro ONNX layout at ${abs} (need tokenizer.json and onnx/model_quantized.onnx)`,
    {
      code: 'kokoro_import',
      rule: 'layout',
      path: abs,
      hint: 'Export from Settings after download, or copy the Hugging Face model folder.',
    },
  );
}

export function assertKokoroLayout(dir) {
  return findKokoroLayout(dir);
}

function hasVocelloWeights(dir) {
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
  return dirSizeBytes(dir) > 1024 * 1024;
}

/**
 * A Vocello export is either `pro_design_speed/` itself or a parent that contains it.
 */
export function findVocelloLayout(dir) {
  const abs = resolveUserPath(dir, { mustExist: true });
  if (!fs.statSync(abs).isDirectory()) {
    throw new ApexError('Vocello import path must be a directory', {
      code: 'bad_path',
      rule: 'directory',
      path: abs,
    });
  }
  const named = path.join(abs, VOCELLO_DESIGN_MODEL);
  if (hasVocelloWeights(named)) return named;
  if (path.basename(abs) === VOCELLO_DESIGN_MODEL && hasVocelloWeights(abs)) return abs;
  if (hasVocelloWeights(abs)) return abs;
  throw new ApexError(
    `No Vocello model files at ${abs} (expected ${VOCELLO_DESIGN_MODEL} weights, >1 MB)`,
    {
      code: 'vocello_import',
      rule: 'layout',
      path: abs,
      hint: 'Save to Disk from Settings after install, then Load from that folder.',
    },
  );
}

export async function setupKokoro({ log = () => {} } = {}) {
  const prev = process.env.APEXPLAIN_ALLOW_HF;
  process.env.APEXPLAIN_ALLOW_HF = '1';
  resetTTS();
  try {
    log(`model=${TTS_MODEL} dtype=${ttsDtype()}`);
    log(`target=${kokoroOnnxPath()}`);
    const tts = await loadTTS({ log });
    const r = await tts.generate('Kokoro offline ready.', { voice: 'af_heart' });
    const n = r?.audio?.length ?? 0;
    log(`Synthesized ${n} samples @ ${r.sampling_rate} Hz`);
  } finally {
    if (prev === undefined) delete process.env.APEXPLAIN_ALLOW_HF;
    else process.env.APEXPLAIN_ALLOW_HF = prev;
    resetTTS();
  }
  const after = probeKokoro();
  if (!after.ok) {
    throw new ApexError(`Kokoro still incomplete: ${after.detail}`, {
      code: 'kokoro_setup',
      rule: 'probe',
      hint: after.fix,
    });
  }
  return after;
}

export function exportKokoro(destPath) {
  if (!hasKokoroFiles(kokoroModelDir())) {
    throw new ApexError(`Kokoro weights missing at ${kokoroModelDir()}`, {
      code: 'kokoro_export',
      rule: 'layout',
      hint: 'Download from Hugging Face first, or Load from disk…',
      path: kokoroOnnxPath(),
    });
  }
  const dest = resolveUserPath(destPath);
  copyTree(kokoroModelDir(), dest);
  return writeLastSave('kokoro', lastSaveRecord(dest));
}

export function importKokoro(srcPath) {
  const src = findKokoroLayout(srcPath);
  const dest = kokoroModelDir();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (path.resolve(src) !== path.resolve(dest)) {
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    copyTree(src, dest);
  }
  resetTTS();
  if (!hasKokoroFiles(dest)) {
    throw new ApexError(`Import did not produce a usable Kokoro cache at ${dest}`, {
      code: 'kokoro_import',
      rule: 'layout',
      path: dest,
    });
  }
  writeLastSave('kokoro', lastSaveRecord(src));
  return probeKokoro();
}

export function clearKokoro() {
  const dir = kokoroModelDir();
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  resetTTS();
  return probeKokoro();
}

export async function setupVocello({ log = () => {} } = {}) {
  return installVocelloDesignModel({ log });
}

export function exportVocello(destPath) {
  const probe = probeVocello();
  const srcCandidates = [vocelloDesignModelDir(), vocelloModelsRoot()];
  const src = srcCandidates.find((d) => hasVocelloWeights(d));
  if (!src) {
    throw new ApexError(probe.ok ? 'Vocello model folder not found' : `Vocello not ready: ${probe.detail}`, {
      code: 'vocello_export',
      rule: 'exists',
      hint: probe.fix || `Expected weights under ${vocelloDesignModelDir()}`,
      path: vocelloDesignModelDir(),
    });
  }
  const dest = resolveUserPath(destPath);
  copyTree(src, dest);
  return writeLastSave('vocello', lastSaveRecord(dest));
}

export function importVocello(srcPath) {
  const src = findVocelloLayout(srcPath);
  const dest = vocelloDesignModelDir();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (path.resolve(src) !== path.resolve(dest)) {
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    copyTree(src, dest);
  }
  writeLastSave('vocello', lastSaveRecord(src));
  const probe = probeVocello();
  return { ...probe, imported: dest, modelDir: dest };
}

export async function clearVocello({ log = () => {} } = {}) {
  return uninstallVocelloDesignModel({ log });
}

export function modelsSnapshot() {
  const kokoro = probeKokoro();
  const vocello = probeVocello();
  const meta = readModelsMeta();
  const onnx = kokoroOnnxPath();
  const tokenizer = path.join(kokoroModelDir(), 'tokenizer.json');
  return {
    ok: true,
    cacheRoot: cacheRoot(),
    kokoro: {
      ok: kokoro.ok,
      detail: kokoro.detail,
      fix: kokoro.fix,
      dtype: kokoro.dtype,
      onnx,
      tokenizer,
      dir: kokoroModelDir(),
      bytes: dirSizeBytes(kokoroModelDir()),
      lastSave: meta.kokoro,
      hfPage: KOKORO_HF_PAGE,
      model: TTS_MODEL,
      sizeLabel: KOKORO_SIZE_LABEL,
    },
    vocello: {
      ok: vocello.ok,
      detail: vocello.detail,
      fix: vocello.fix,
      bin: vocello.bin || null,
      version: vocello.version || null,
      model: VOCELLO_DESIGN_MODEL,
      dir: vocello.modelDir || vocelloDesignModelDir(),
      modelsRoot: vocelloModelsRoot(),
      bytes: dirSizeBytes(vocello.modelDir || vocelloDesignModelDir()),
      lastSave: meta.vocello,
      releasesPage: VOCELLO_RELEASES,
      sizeLabel: VOCELLO_SIZE_LABEL,
    },
  };
}
