/**
 * Load skills/apexplain/SKILL.md for Autogenerate + agents.
 * Autogenerate system prompts are derived from this file so UI and skill stay aligned.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CLIPART_NAMES } from './clipart.js';
import { ROOT } from './paths.js';

export const SKILL_PATH = path.join(ROOT, 'skills', 'apexplain', 'SKILL.md');

/** Strip YAML frontmatter from a skill markdown file. */
export function stripFrontmatter(md) {
  const s = String(md || '');
  if (!s.startsWith('---')) return s.trim();
  const end = s.indexOf('\n---', 3);
  if (end === -1) return s.trim();
  return s.slice(end + 4).trim();
}

/**
 * Drop CLI/install noise that does not help script/scene writing.
 * Keeps Layouts, Script rules, Language, Files, Output.
 */
export function skillBodyForAutogenerate(md) {
  const body = stripFrontmatter(md);
  // Remove the Commands fenced block + heading — models don't need CLI how-to.
  return body
    .replace(/^## Commands\n[\s\S]*?(?=\n## )/m, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

let cachedRaw = null;
let cachedMtime = null;

export function loadSkillMarkdown({ force = false } = {}) {
  const st = fs.statSync(SKILL_PATH);
  const mtime = st.mtimeMs;
  if (!force && cachedRaw != null && cachedMtime === mtime) return cachedRaw;
  cachedRaw = fs.readFileSync(SKILL_PATH, 'utf8');
  cachedMtime = mtime;
  return cachedRaw;
}

/**
 * System prompt for Settings LLM Autogenerate — skill first, then output contract.
 */
export function buildAutogenerateSystemPrompt({
  lang = 'en',
  boardActive = false,
  targetSeconds = null,
  lengthHint = null,
} = {}) {
  const zh = lang === 'zh-HK';
  const skill = skillBodyForAutogenerate(loadSkillMarkdown());
  const t = Number(targetSeconds);
  const lengthLine =
    lengthHint ||
    (Number.isFinite(t) && t >= 15
      ? `HARD: finished length about ${Math.round(t)} seconds (stay within ~15%). Fill every outline beat with enough spoken sentences on the first draft — not a generic 45–90s stub.`
      : 'If no targetSeconds is given, write enough speech for about 45–90 seconds.');
  const lengthBlock = [
    '## LENGTH (read first — non-negotiable)',
    lengthLine,
    'Obey each outline beat\'s minSentences and minWords/minChars. Expand scriptSkeleton fully.',
    'Match scenes.json item/series counts to spoken sentence counts when cue is "sentence".',
    'Under-writing vs targetSeconds fails the task. Do not produce a thin short stub.',
  ].join('\n');

  const contract = [
    '## Autogenerate output contract',
    'Return ONLY a JSON object: { "script": string, "scenes": object }.',
    'script = full script.md text. scenes = scenes.json object keyed by scene id.',
    'Follow every Layout / Script / Language rule in the Apexplain skill above.',
    zh
      ? 'This run: lang is zh-HK — Traditional Chinese (Hong Kong); end sentences with 。！？.'
      : 'This run: lang is en — English.',
    `clipart field: ONLY these exact names: ${CLIPART_NAMES.join(', ')}.`,
    'Lucide names (map, home, train, globe, …) go in "icon", never in "clipart".',
    'Prefer clipart for mechanisms; icon for small accents. Prefer stat for one big number; chart when 2–5 comparable numeric points exist.',
    'CRITICAL layout pick: for each middle beat, quickly choose ONE layout from that beat\'s layoutHints (or the skill decision table) based on what the beat *shows* — ordered→steps, cause/pipeline/merge→flow, filter/narrow→funnel, two sides→compare, parts→cards, one number→stat, 2–5 numbers/trend→chart, history/time→timeline, key line→quote. Open/close→title (close may be quote).',
    'Do NOT round-robin layouts. Do NOT default middle scenes to cards. At most one middle scene may be cards unless the beat is truly parts-of-a-whole.',
    'Allowed layouts only: title, cards, steps, compare, flow, stat, chart, timeline, quote, funnel.',
    'Pair clipart to the relation when helpful: funnel→funnel; merge/flow→nodes|stack; parts→subject metaphor; quote→book; stat→bars.',
    'One visual hero idea per scene. Match item/series count to sentence count when cue is "sentence".',
    'cue must be exactly "sentence" or omitted.',
    'ALWAYS include a per-scene "motion" object (see skill Motion table): title/quote→fade/slidePx; steps/cards/timeline/funnel→stagger~0.07; flow→drawOn+stagger; compare→stagger~0.08; stat→countUp~1.0; chart→drawOn~0.6+stagger. Prefer clearer motion; do not omit motion and do not set enabled:false.',
    'Do not wrap ordinary words in curly braces. Only use {shown|spoken} when on-screen text must differ from TTS (example: {API|A P I}). Prefer plain words.',
    boardActive
      ? 'The user storyboard is authoritative for beat order, scene ids, and notes. Still pick layout by what each beat shows (layoutHints).'
      : 'Follow outline scene ids and headings; pick layout per beat using layoutHints + the decision table.',
  ].join('\n');

  return [
    'You write Apexplain explainer videos. Obey LENGTH first, then the skill, then the output contract.',
    '',
    lengthBlock,
    '',
    '# Apexplain skill (source of truth)',
    skill,
    '',
    contract,
  ].join('\n');
}
