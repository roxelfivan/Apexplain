/**
 * TTS / narration voice settings — Kokoro (en) + Vocello Voice Design (zh-HK).
 * Stored at ~/.config/apexplain/tts.json (mode 0600).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ApexError } from '../errors.js';
import { configDir } from '../llm/config.js';

/** Kokoro voice ids (rates live in timeline.js; keep the picker list here). */
export const KOKORO_VOICES = [
  'af_heart',
  'af_bella',
  'af_nicole',
  'af_aoede',
  'af_kore',
  'af_sarah',
  'af_nova',
  'af_alloy',
  'af_jessica',
  'af_river',
  'am_michael',
  'am_fenrir',
  'am_puck',
  'am_echo',
  'am_eric',
  'am_liam',
  'am_onyx',
  'am_santa',
  'bf_emma',
  'bf_alice',
  'bf_lily',
  'bm_george',
  'bm_fable',
  'bm_lewis',
];

export const VOCELLO_LANGUAGES = ['chinese', 'auto', 'english'];

export const DEFAULT_VOCELLO_BRIEF =
  'A clear adult male Hong Kong Cantonese narrator, warm and natural. Speak fluent 粵語 (Cantonese) only — never Mandarin / 普通話.';

export const DEFAULT_TTS = {
  vocello: {
    voiceBrief: DEFAULT_VOCELLO_BRIEF,
    seed: 42,
    delivery: 'Speak in Hong Kong Cantonese (粵語). Clear explainer pacing. Do not use Mandarin.',
    language: 'chinese',
  },
  kokoro: {
    voice: 'af_heart',
    speed: 1,
  },
};

export function ttsSettingsPath() {
  return path.join(configDir(), 'tts.json');
}

function clampSeed(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return DEFAULT_TTS.vocello.seed;
  // Vocello accepts integer seeds; keep in unsigned 32-bit-ish range for UI.
  const i = Math.trunc(x);
  if (i < 0) return 0;
  if (i > Number.MAX_SAFE_INTEGER) return DEFAULT_TTS.vocello.seed;
  return i;
}

function clampSpeed(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.min(2, Math.max(0.5, Math.round(x * 100) / 100));
}

export function normalizeTtsSettings(raw = {}) {
  const vIn = raw.vocello && typeof raw.vocello === 'object' ? raw.vocello : {};
  const kIn = raw.kokoro && typeof raw.kokoro === 'object' ? raw.kokoro : {};

  let voiceBrief =
    typeof vIn.voiceBrief === 'string' && vIn.voiceBrief.trim()
      ? vIn.voiceBrief.trim()
      : DEFAULT_TTS.vocello.voiceBrief;
  if (voiceBrief.length > 500) voiceBrief = voiceBrief.slice(0, 500);

  let language = String(vIn.language || DEFAULT_TTS.vocello.language).trim().toLowerCase();
  if (!VOCELLO_LANGUAGES.includes(language)) language = 'chinese';

  let delivery = typeof vIn.delivery === 'string' ? vIn.delivery.trim() : '';
  if (delivery.length > 500) delivery = delivery.slice(0, 500);

  let voice =
    typeof kIn.voice === 'string' && kIn.voice.trim() ? kIn.voice.trim() : DEFAULT_TTS.kokoro.voice;
  if (!KOKORO_VOICES.includes(voice)) voice = DEFAULT_TTS.kokoro.voice;

  return {
    vocello: {
      voiceBrief,
      seed: clampSeed(vIn.seed ?? DEFAULT_TTS.vocello.seed),
      delivery,
      language,
    },
    kokoro: {
      voice,
      speed: clampSpeed(kIn.speed ?? DEFAULT_TTS.kokoro.speed),
    },
  };
}

/** Apply env overrides (win over file). */
export function applyTtsEnvOverrides(cfg) {
  const next = {
    vocello: { ...cfg.vocello },
    kokoro: { ...cfg.kokoro },
  };
  if (process.env.APEXPLAIN_VOCELLO_BRIEF?.trim()) {
    next.vocello.voiceBrief = process.env.APEXPLAIN_VOCELLO_BRIEF.trim().slice(0, 500);
  }
  if (process.env.APEXPLAIN_VOCELLO_LANGUAGE?.trim()) {
    const lang = process.env.APEXPLAIN_VOCELLO_LANGUAGE.trim().toLowerCase();
    if (VOCELLO_LANGUAGES.includes(lang)) next.vocello.language = lang;
  }
  if (process.env.APEXPLAIN_VOCELLO_DELIVERY != null) {
    next.vocello.delivery = String(process.env.APEXPLAIN_VOCELLO_DELIVERY).trim().slice(0, 500);
  }
  if (process.env.APEXPLAIN_VOCELLO_SEED != null && process.env.APEXPLAIN_VOCELLO_SEED !== '') {
    next.vocello.seed = clampSeed(process.env.APEXPLAIN_VOCELLO_SEED);
  }
  if (process.env.APEXPLAIN_KOKORO_VOICE?.trim()) {
    const v = process.env.APEXPLAIN_KOKORO_VOICE.trim();
    if (KOKORO_VOICES.includes(v)) next.kokoro.voice = v;
  }
  if (process.env.APEXPLAIN_KOKORO_SPEED != null && process.env.APEXPLAIN_KOKORO_SPEED !== '') {
    next.kokoro.speed = clampSpeed(process.env.APEXPLAIN_KOKORO_SPEED);
  }
  return next;
}

export function loadTtsSettings() {
  const file = ttsSettingsPath();
  let fromFile = {};
  try {
    if (fs.existsSync(file)) {
      fromFile = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    throw new ApexError(`tts.json is not valid JSON: ${e.message}`, {
      code: 'bad_json',
      path: file,
      rule: 'json',
    });
  }
  return applyTtsEnvOverrides(normalizeTtsSettings(fromFile));
}

export function saveTtsSettings(partial = {}) {
  // Re-read file without env so Save does not bake env overrides into disk.
  let fromFile = {};
  const file = ttsSettingsPath();
  try {
    if (fs.existsSync(file)) fromFile = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fromFile = {};
  }
  const base = normalizeTtsSettings(fromFile);
  const next = normalizeTtsSettings({
    vocello: { ...base.vocello, ...(partial.vocello || {}) },
    kokoro: { ...base.kokoro, ...(partial.kokoro || {}) },
  });
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true });
  const body = {
    vocello: next.vocello,
    kokoro: next.kokoro,
  };
  fs.writeFileSync(file, JSON.stringify(body, null, 2) + '\n', { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* ignore */
  }
  // Return effective settings (with env) so UI/API match runtime.
  return applyTtsEnvOverrides(next);
}

export function publicTtsSettings(cfg = loadTtsSettings()) {
  return {
    vocello: { ...cfg.vocello },
    kokoro: { ...cfg.kokoro },
    kokoroVoices: KOKORO_VOICES.slice(),
    vocelloLanguages: VOCELLO_LANGUAGES.slice(),
  };
}

/** Fingerprint for voice cache invalidation when Settings change. */
export function ttsCacheFingerprint(cfg = loadTtsSettings()) {
  return {
    vocelloBrief: cfg.vocello.voiceBrief,
    vocelloSeed: cfg.vocello.seed,
    vocelloDelivery: cfg.vocello.delivery || '',
    vocelloLanguage: cfg.vocello.language,
    kokoroVoice: cfg.kokoro.voice,
    kokoroSpeed: cfg.kokoro.speed,
  };
}
