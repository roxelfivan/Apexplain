/**
 * Validate scenes.json: five declarative layouts + cue rules.
 */
import { ApexError } from './errors.js';

export const LAYOUTS = new Set(['title', 'cards', 'steps', 'compare', 'flow']);

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

function validateCueFields(scene, path, { hasItems }) {
  if (scene.cue !== undefined && scene.cue !== null) {
    if (scene.cue !== 'sentence') {
      fail(`${path}/cue`, 'enum', `cue must be "sentence" when set`, 'Use "sentence" or omit cue.');
    }
    if (!hasItems) {
      fail(`${path}/cue`, 'cue_needs_items', `cue is only valid on layouts with items`);
    }
  }
}

function validateItem(item, path, index) {
  const ip = `${path}/items/${index}`;
  if (!isPlainObject(item)) fail(ip, 'type', `items[${index}] must be an object`);
  requireString(item, 'text', ip);
  optionalString(item, 'icon', ip);
  if (item.at !== undefined && item.at !== null) {
    if (!Number.isInteger(item.at) || item.at < 0) {
      fail(`${ip}/at`, 'sentence_index', `"at" must be a non-negative integer (sentence index)`);
    }
  }
  if (item.marker !== undefined && item.marker !== null) {
    if (typeof item.marker !== 'string' || !/^[A-Za-z0-9_-]+$/.test(item.marker)) {
      fail(`${ip}/marker`, 'marker', `"marker" must look like a [#name] id (letters, digits, -, _)`);
    }
  }
  if (item.at != null && item.marker != null) {
    fail(ip, 'cue_xor', `items[${index}] cannot set both "at" and "marker"`);
  }
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
      'Pick title, cards, steps, compare, or flow.',
    );
  }

  switch (scene.layout) {
    case 'title':
      requireString(scene, 'title', path);
      optionalString(scene, 'subtitle', path);
      if (scene.items !== undefined) fail(`${path}/items`, 'unexpected', `title layout has no "items"`);
      validateCueFields(scene, path, { hasItems: false });
      break;
    case 'cards':
    case 'steps':
    case 'flow':
      validateItems(scene, path, { min: 1 });
      validateCueFields(scene, path, { hasItems: true });
      break;
    case 'compare':
      if (!scene.left) fail(`${path}/left`, 'required', `compare layout needs "left"`);
      if (!scene.right) fail(`${path}/right`, 'required', `compare layout needs "right"`);
      validateSide(scene.left, `${path}/left`);
      validateSide(scene.right, `${path}/right`);
      if (scene.items !== undefined) fail(`${path}/items`, 'unexpected', `compare layout has no "items"`);
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

    if (Array.isArray(layout.items) && layout.cue === 'sentence') {
      const nItems = layout.items.length;
      const nSent = sc.sentenceCount;
      if (nSent > 0 && nItems !== nSent) {
        notes.push(
          `${sc.id}: cue "sentence" has ${nItems} item${nItems === 1 ? '' : 's'} but ${nSent} sentence${nSent === 1 ? '' : 's'} — extras stay hidden or last item holds`,
        );
      }
    }

    if (Array.isArray(layout.items)) {
      layout.items.forEach((it, i) => {
        if (it.marker && !(it.marker in sc.marks)) {
          fail(
            `scenes.json/${sc.id}/items/${i}/marker`,
            'unknown_marker',
            `marker "${it.marker}" is not in script scene "${sc.id}"`,
            `Add [#${it.marker}] to that scene's narration, or fix the marker name.`,
          );
        }
        if (it.at != null && sc.sentenceCount > 0 && it.at >= sc.sentenceCount) {
          fail(
            `scenes.json/${sc.id}/items/${i}/at`,
            'sentence_range',
            `"at": ${it.at} is past the last sentence index (${sc.sentenceCount - 1}) in "${sc.id}"`,
          );
        }
      });
    }
  }

  return notes;
}
