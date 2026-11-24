/**
 * Validate scenes.json: declarative layouts + cue rules.
 */
import { ApexError } from './errors.js';
import { hasClipart, CLIPART_NAMES } from './clipart.js';
import { validateMotion } from './motion.js';

export const LAYOUTS = new Set([
  'title',
  'cards',
  'steps',
  'compare',
  'flow',
  'stat',
  'chart',
  'timeline',
  'quote',
  'funnel',
]);
export const CHART_KINDS = new Set(['bar', 'line', 'pie']);

function fail(path, rule, message, hint = null) {
  throw new ApexError(message, {
    code: 'bad_scenes',
    path,
    rule,
    hint,
  });
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function requireString(obj, key, path, { optional = false, allowEmpty = false } = {}) {
  if (obj[key] === undefined || obj[key] === null) {
    if (optional) return;
    fail(`${path}/${key}`, 'required', `missing "${key}"`, `Add a string "${key}" field.`);
  }
  if (typeof obj[key] !== 'string') {
    fail(`${path}/${key}`, 'type', `"${key}" must be a string`);
  }
  if (!allowEmpty && !obj[key].trim()) {
    fail(`${path}/${key}`, 'nonempty', `"${key}" must not be empty`);
  }
}

function optionalString(obj, key, path) {
  if (obj[key] === undefined || obj[key] === null) return;
  requireString(obj, key, path, { allowEmpty: false });
}

function optionalClipart(obj, path) {
  if (obj.clipart === undefined || obj.clipart === null) return;
  requireString(obj, 'clipart', path);
  if (!hasClipart(obj.clipart)) {
    fail(
      `${path}/clipart`,
      'clipart',
      `unknown clipart "${obj.clipart}"`,
      `Use one of: ${CLIPART_NAMES.join(', ')}.`,
    );
  }
}

function validateCueFields(scene, path, { hasItems }) {
  if (scene.cue !== undefined && scene.cue !== null) {
    if (scene.cue !== 'sentence') {
      fail(`${path}/cue`, 'enum', `cue must be "sentence" when set`, 'Use "sentence" or omit cue.');
    }
    if (!hasItems) {
      fail(
        `${path}/cue`,
        'cue_needs_items',
        `cue is only valid on steps/cards/flow/chart/compare/timeline/funnel`,
      );
    }
  }
}

function validateCueTarget(obj, path) {
  if (obj.at !== undefined && obj.at !== null) {
    if (!Number.isInteger(obj.at) || obj.at < 0) {
      fail(`${path}/at`, 'sentence_index', `"at" must be a non-negative integer (sentence index)`);
    }
  }
  if (obj.marker !== undefined && obj.marker !== null) {
    if (typeof obj.marker !== 'string' || !/^[A-Za-z0-9_-]+$/.test(obj.marker)) {
      fail(`${path}/marker`, 'marker', `"marker" must look like a [#name] id (letters, digits, -, _)`);
    }
  }
  if (obj.at != null && obj.marker != null) {
    fail(path, 'cue_xor', `cannot set both "at" and "marker"`);
  }
}

function validateItem(item, path, index) {
  const ip = `${path}/items/${index}`;
  if (!isPlainObject(item)) fail(ip, 'type', `items[${index}] must be an object`);
  requireString(item, 'text', ip);
  optionalString(item, 'icon', ip);
  optionalClipart(item, ip);
  validateCueTarget(item, ip);
}

function validateItems(scene, path, { min = 1 } = {}) {
  if (!Array.isArray(scene.items)) {
    fail(`${path}/items`, 'required', `missing "items" array`);
  }
  if (scene.items.length < min) {
    fail(`${path}/items`, 'min_items', `"items" needs at least ${min} entr${min === 1 ? 'y' : 'ies'}`);
  }
  scene.items.forEach((it, i) => validateItem(it, path, i));
}

function validateSide(side, path) {
  if (!isPlainObject(side)) fail(path, 'type', `must be an object with "text"`);
  requireString(side, 'text', path);
  optionalString(side, 'title', path);
  optionalString(side, 'icon', path);
  optionalClipart(side, path);
  validateCueTarget(side, path);
}

function validateSeriesPoint(point, path, index) {
  const sp = `${path}/series/${index}`;
  if (!isPlainObject(point)) fail(sp, 'type', `series[${index}] must be an object`);
  requireString(point, 'label', sp);
  if (typeof point.value !== 'number' || !Number.isFinite(point.value)) {
    fail(`${sp}/value`, 'type', `"value" must be a finite number`);
  }
  validateCueTarget(point, sp);
}

function validateChart(scene, path) {
  requireString(scene, 'kind', path);
  if (!CHART_KINDS.has(scene.kind)) {
    fail(
      `${path}/kind`,
      'enum',
      `kind must be one of: ${[...CHART_KINDS].join(', ')}`,
      'Pick bar, line, or pie.',
    );
  }
  optionalString(scene, 'title', path);
  if (!Array.isArray(scene.series)) {
    fail(`${path}/series`, 'required', `chart layout needs a "series" array`);
  }
  if (scene.series.length < 2 || scene.series.length > 8) {
    fail(`${path}/series`, 'series_len', `"series" needs 2–8 points`);
  }
  scene.series.forEach((p, i) => validateSeriesPoint(p, path, i));
  if (scene.highlight !== undefined && scene.highlight !== null) {
    if (!Number.isInteger(scene.highlight) || scene.highlight < 0 || scene.highlight >= scene.series.length) {
      fail(`${path}/highlight`, 'highlight', `"highlight" must be a series index`);
    }
  }
  if (scene.items !== undefined) fail(`${path}/items`, 'unexpected', `chart layout has no "items"`);
  validateCueFields(scene, path, { hasItems: true });
}

function validateStat(scene, path) {
  requireString(scene, 'value', path);
  optionalString(scene, 'unit', path);
  optionalString(scene, 'caption', path);
  optionalClipart(scene, path);
  if (scene.items !== undefined) fail(`${path}/items`, 'unexpected', `stat layout has no "items"`);
  validateCueFields(scene, path, { hasItems: false });
}

function validateScene(id, scene) {
  const path = `scenes.json/${id}`;
  if (!isPlainObject(scene)) fail(path, 'type', `scene "${id}" must be an object`);
  requireString(scene, 'layout', path);
  if (!LAYOUTS.has(scene.layout)) {
    fail(
      `${path}/layout`,
      'enum',
      `layout must be one of: ${[...LAYOUTS].join(', ')}`,
      'Pick title, cards, steps, compare, flow, stat, chart, timeline, quote, or funnel.',
    );
  }
  if (scene.motion !== undefined) {
    validateMotion(scene.motion, `${path}/motion`);
  }

  switch (scene.layout) {
    case 'title':
      requireString(scene, 'title', path);
      optionalString(scene, 'subtitle', path);
      optionalClipart(scene, path);
      if (scene.items !== undefined) fail(`${path}/items`, 'unexpected', `title layout has no "items"`);
      validateCueFields(scene, path, { hasItems: false });
      break;
    case 'cards':
    case 'steps':
    case 'flow':
    case 'timeline':
    case 'funnel':
      validateItems(scene, path, { min: scene.layout === 'funnel' ? 2 : 1 });
      validateCueFields(scene, path, { hasItems: true });
      break;
    case 'compare':
      if (!scene.left) fail(`${path}/left`, 'required', `compare layout needs "left"`);
      if (!scene.right) fail(`${path}/right`, 'required', `compare layout needs "right"`);
      validateSide(scene.left, `${path}/left`);
      validateSide(scene.right, `${path}/right`);
      if (scene.items !== undefined) fail(`${path}/items`, 'unexpected', `compare layout has no "items"`);
      // cue:"sentence" reveals left then right
      validateCueFields(scene, path, { hasItems: true });
      break;
    case 'stat':
      validateStat(scene, path);
      break;
    case 'chart':
      validateChart(scene, path);
      break;
    case 'quote':
      requireString(scene, 'text', path);
      optionalString(scene, 'attrib', path);
      optionalClipart(scene, path);
      if (scene.items !== undefined) fail(`${path}/items`, 'unexpected', `quote layout has no "items"`);
      validateCueFields(scene, path, { hasItems: false });
      break;
    default:
      break;
  }
}

/**
 * Parse + validate scenes.json object. Returns normalized scenes map.
 */
export function validateScenes(raw) {
  if (!isPlainObject(raw)) {
    fail('scenes.json', 'object', 'scenes.json must be an object of scene id → layout');
  }
  const ids = Object.keys(raw);
  if (!ids.length) fail('scenes.json', 'scenes', 'scenes.json has no scenes');

  for (const id of ids) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
      fail(`scenes.json/${id}`, 'scene_id', `scene id "${id}" may only use letters, digits, "-" and "_"`);
    }
    validateScene(id, raw[id]);
  }
  return raw;
}

export function cueTargets(layout) {
  if (!layout) return [];
  if (Array.isArray(layout.items)) return layout.items;
  if (layout.layout === 'chart' && Array.isArray(layout.series)) return layout.series;
  if (layout.layout === 'compare' && (layout.cue === 'sentence' || layout.left?.marker || layout.right?.marker || layout.left?.at != null || layout.right?.at != null)) {
    return [layout.left, layout.right].filter(Boolean);
  }
  return [];
}

/**
 * Cross-check script scene ids against scenes.json keys and cue markers.
 */
export function crossCheck(script, scenes) {
  const scriptIds = script.scenes.map((s) => s.id);
  const sceneIds = Object.keys(scenes);

  for (const id of scriptIds) {
    if (!scenes[id]) {
      fail(
        `scenes.json/${id}`,
        'missing_scene',
        `script has scene "${id}" but scenes.json does not`,
        `Add a "${id}" entry to scenes.json, or rename the ## heading.`,
      );
    }
  }
  for (const id of sceneIds) {
    if (!scriptIds.includes(id)) {
      fail(
        `scenes.json/${id}`,
        'orphan_scene',
        `scenes.json has "${id}" but script.md has no "## ${id}"`,
        `Add "## ${id}" to script.md, or remove the unused layout.`,
      );
    }
  }

  const notes = [];
  for (const sc of script.scenes) {
    const layout = scenes[sc.id];
    if (!layout) continue;
    const targets = cueTargets(layout);

    if (targets.length && layout.cue === 'sentence') {
      const nItems = targets.length;
      const nSent = sc.sentenceCount;
      if (nSent > 0 && nItems !== nSent) {
        notes.push(
          `${sc.id}: cue "sentence" has ${nItems} item${nItems === 1 ? '' : 's'} but ${nSent} sentence${nSent === 1 ? '' : 's'} — extras stay hidden or last item holds`,
        );
      }
    }

    targets.forEach((it, i) => {
      let base;
      if (layout.layout === 'chart') base = `scenes.json/${sc.id}/series/${i}`;
      else if (layout.layout === 'compare') base = `scenes.json/${sc.id}/${i === 0 ? 'left' : 'right'}`;
      else base = `scenes.json/${sc.id}/items/${i}`;
      if (it.marker && !(it.marker in sc.marks)) {
        fail(
          `${base}/marker`,
          'unknown_marker',
          `marker "${it.marker}" is not in script scene "${sc.id}"`,
          `Add [#${it.marker}] to that scene's narration, or fix the marker name.`,
        );
      }
      if (it.at != null && sc.sentenceCount > 0 && it.at >= sc.sentenceCount) {
        fail(
          `${base}/at`,
          'sentence_range',
          `"at": ${it.at} is past the last sentence index (${sc.sentenceCount - 1}) in "${sc.id}"`,
        );
      }
    });
  }

  return notes;
}
