/**
 * Lightweight motion helpers + declarative motion config for video.json / scenes.json.
 */

import { ApexError } from './errors.js';

/** Defaults applied when video.json / scenes omit motion fields. */
export const DEFAULT_MOTION = {
  /** When false, SoftIn/draw-on/count-up snap to final state (no animation). */
  enabled: true,
  /** SoftIn fade duration (seconds). */
  fade: 0.4,
  /** SoftIn upward slide distance (px). */
  slidePx: 14,
  /** Draw-on duration for flow arrows / chart growth (seconds). */
  drawOn: 0.45,
  /** Stat number count-up duration (seconds). */
  countUp: 0.75,
  /** Extra delay per item index on top of cue times (seconds). */
  stagger: 0,
};

const MOTION_KEYS = Object.keys(DEFAULT_MOTION);

/**
 * Merge DEFAULT ← video.motion ← scene.motion (later wins).
 */
export function resolveMotion(...layers) {
  const out = { ...DEFAULT_MOTION };
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object' || Array.isArray(layer)) continue;
    if (layer.enabled !== undefined && layer.enabled !== null) out.enabled = !!layer.enabled;
    for (const key of ['fade', 'slidePx', 'drawOn', 'countUp', 'stagger']) {
      if (layer[key] === undefined || layer[key] === null) continue;
      const n = Number(layer[key]);
      if (Number.isFinite(n)) out[key] = n;
    }
  }
  return out;
}

/**
 * Validate a motion object (video.json or scenes.json). Throws ApexError.
 */
export function validateMotion(raw, path = 'motion') {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApexError(`"${path}" must be an object`, {
      code: 'bad_motion',
      path,
      rule: 'object',
      hint: 'Example: { "fade": 0.4, "slidePx": 14, "drawOn": 0.45, "countUp": 0.75, "stagger": 0, "enabled": true }',
    });
  }
  for (const key of Object.keys(raw)) {
    if (!MOTION_KEYS.includes(key)) {
      throw new ApexError(`unknown motion key "${key}"`, {
        code: 'bad_motion',
        path: `${path}/${key}`,
        rule: 'unknown_key',
        hint: `Allowed: ${MOTION_KEYS.join(', ')}`,
      });
    }
  }
  if (raw.enabled != null && typeof raw.enabled !== 'boolean') {
    throw new ApexError(`"${path}/enabled" must be a boolean`, {
      code: 'bad_motion',
      path: `${path}/enabled`,
      rule: 'type',
    });
  }
  const ranges = {
    fade: [0, 3],
    slidePx: [0, 80],
    drawOn: [0, 3],
    countUp: [0, 3],
    stagger: [0, 1],
  };
  for (const [key, [lo, hi]] of Object.entries(ranges)) {
    if (raw[key] === undefined || raw[key] === null) continue;
    const n = Number(raw[key]);
    if (!Number.isFinite(n) || n < lo || n > hi) {
      throw new ApexError(`"${path}/${key}" must be a number from ${lo} to ${hi}`, {
        code: 'bad_motion',
        path: `${path}/${key}`,
        rule: 'range',
      });
    }
  }
  return raw;
}

/** Ease-out power curve (a2e SoftIn-ish). */
export function easeOut(p, pow = 2.5) {
  const t = Math.max(0, Math.min(1, p));
  return 1 - (1 - t) ** pow;
}

/**
 * SoftIn: opacity fade + slight upward settle.
 * @returns {{ alpha: number, dy: number, p: number }}
 */
export function softIn(t, at = 0, { fade = 0.4, slidePx = 14 } = {}) {
  if (t === Infinity || !Number.isFinite(t)) return { alpha: 1, dy: 0, p: 1 };
  if (fade <= 0 && slidePx <= 0) {
    return t + 1e-6 < at ? { alpha: 0, dy: 0, p: 0 } : { alpha: 1, dy: 0, p: 1 };
  }
  if (t + 1e-6 < at) return { alpha: 0, dy: slidePx, p: 0 };
  const raw = Math.min(1, (t - at) / Math.max(1e-6, fade));
  const p = easeOut(raw);
  return { alpha: p, dy: slidePx * (1 - p), p };
}

/** SoftIn using a resolved motion config (respects enabled). */
export function softInMotion(t, at, motion = DEFAULT_MOTION) {
  if (!motion.enabled) {
    return t === Infinity || !Number.isFinite(t) || t + 1e-6 >= at
      ? { alpha: 1, dy: 0, p: 1 }
      : { alpha: 0, dy: 0, p: 0 };
  }
  return softIn(t, at, { fade: motion.fade, slidePx: motion.slidePx });
}

/** 0→1 draw-on progress for arrows / bar growth. */
export function drawOn(t, at = 0, dur = 0.45) {
  return softIn(t, at, { fade: dur, slidePx: 0 }).p;
}

export function drawOnMotion(t, at, motion = DEFAULT_MOTION) {
  if (!motion.enabled) return t + 1e-6 < at && t !== Infinity ? 0 : 1;
  return drawOn(t, at, motion.drawOn);
}

/**
 * Count toward a numeric target after `at`.
 */
export function countUp(t, at, target, { dur = 0.7 } = {}) {
  if (!Number.isFinite(target)) return target;
  const p = softIn(t, at, { fade: dur, slidePx: 0 }).p;
  return target * p;
}

/**
 * Format a counted value while preserving a simple prefix/suffix
 * (e.g. "~2 ms", "42%", "$1,000").
 */
export function formatCountUp(t, at, valueStr, { dur = 0.7 } = {}) {
  const s = String(valueStr ?? '');
  if (t === Infinity || !Number.isFinite(t)) return s;
  const m = s.match(/^([^\d\-]*)(-?\d+(?:\.\d+)?)(.*)$/);
  if (!m) {
    return softIn(t, at, { fade: 0.35, slidePx: 0 }).alpha > 0 ? s : '';
  }
  const [, prefix, num, suffix] = m;
  const target = Number(num);
  const decimals = (num.split('.')[1] || '').length;
  const current = countUp(t, at, target, { dur });
  const shown = decimals > 0 ? current.toFixed(decimals) : String(Math.round(current));
  return `${prefix}${shown}${suffix}`;
}

export function formatCountUpMotion(t, at, valueStr, motion = DEFAULT_MOTION) {
  if (!motion.enabled) {
    return t === Infinity || !Number.isFinite(t) || t + 1e-6 >= at ? String(valueStr ?? '') : '';
  }
  return formatCountUp(t, at, valueStr, { dur: motion.countUp });
}

/** Stagger delay (seconds) for list index i. */
export function stagger(i, step = 0.06) {
  return Math.max(0, i) * (step || 0);
}
