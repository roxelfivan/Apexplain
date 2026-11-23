/**
 * Load and validate an Apexplain project directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ApexError } from './errors.js';
import { projectPaths } from './paths.js';
import { parseScript } from './script.js';
import { crossCheck, validateScenes } from './scenes.js';

const SIZES = new Set(['16:9', '9:16']);
const THEMES = new Set(['studio', 'dark']);
const LANGS = new Set(['en', 'zh-HK']);

export { LANGS };

function readJson(file, label) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    throw new ApexError(`missing ${label}`, {
      code: 'missing_file',
      path: label,
      rule: 'required_file',
      hint: 'Run apexplain init <dir> first, or restore the file.',
    });
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new ApexError(`${label} is not valid JSON: ${e.message}`, {
      code: 'bad_json',
      path: label,
      rule: 'json',
    });
  }
}

function validateVideo(video) {
  if (!video || typeof video !== 'object' || Array.isArray(video)) {
    throw new ApexError('video.json must be an object', {
      code: 'bad_video',
      path: 'video.json',
      rule: 'object',
    });
  }
  if (video.size != null && !SIZES.has(video.size)) {
    throw new ApexError(`size must be 16:9 or 9:16, not "${video.size}"`, {
      code: 'bad_video',
      path: 'video.json/size',
      rule: 'enum',
    });
  }
  if (video.theme != null && !THEMES.has(video.theme)) {
    throw new ApexError(`theme must be studio or dark, not "${video.theme}"`, {
      code: 'bad_video',
      path: 'video.json/theme',
      rule: 'enum',
    });
  }
  if (video.lang != null && !LANGS.has(video.lang)) {
    throw new ApexError(`lang must be en or zh-HK, not "${video.lang}"`, {
      code: 'bad_video',
      path: 'video.json/lang',
      rule: 'enum',
    });
  }
  const lang = video.lang || 'en';
  const defaultVoice = lang === 'zh-HK' ? 'vocello' : 'af_heart';
  return {
    title: typeof video.title === 'string' ? video.title : null,
    lang,
    size: video.size || '16:9',
    theme: video.theme || 'studio',
    voice: video.voice || defaultVoice,
    fps: Number.isFinite(video.fps) ? video.fps : 30,
    lead: Number.isFinite(video.lead) ? video.lead : 0.4,
    hold: Number.isFinite(video.hold) ? video.hold : 0.6,
    end: Number.isFinite(video.end) ? video.end : 1.0,
    speed: Number.isFinite(video.speed) ? video.speed : 1,
    pace: Number.isFinite(video.pace) ? video.pace : 1,
    sentenceGap: Number.isFinite(video.sentenceGap) ? video.sentenceGap : 0.3,
    paragraphGap: Number.isFinite(video.paragraphGap) ? video.paragraphGap : 0.55,
    targetSeconds: Number.isFinite(video.targetSeconds) ? video.targetSeconds : null,
    captions: video.captions ?? 'auto',
    raw: video,
  };
}

/**
 * @returns {{ paths, video, script, scenes, notes }}
 */
export function loadProject(dir) {
  const paths = projectPaths(dir);
  if (!fs.existsSync(paths.root) || !fs.statSync(paths.root).isDirectory()) {
    throw new ApexError(`project folder not found: ${paths.root}`, {
      code: 'missing_project',
      path: paths.root,
      rule: 'exists',
    });
  }

  const video = validateVideo(readJson(paths.video, 'video.json'));

  if (!fs.existsSync(paths.script)) {
    throw new ApexError('missing script.md', {
      code: 'missing_file',
      path: 'script.md',
      rule: 'required_file',
    });
  }
  const script = parseScript(fs.readFileSync(paths.script, 'utf8'));
  const scenes = validateScenes(readJson(paths.scenes, 'scenes.json'));
  const notes = crossCheck(script, scenes);

  return { paths, video, script, scenes, notes };
}

export function displayPath(abs) {
  const rel = path.relative(process.cwd(), abs);
  if (!rel) return '.';
  if (rel.startsWith('..') || path.isAbsolute(rel)) return abs;
  return rel;
}
