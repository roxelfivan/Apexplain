/**
 * Parse Autogenerate LLM output into script.md + scenes.json.
 */
import { ApexError } from '../errors.js';
import { parseScript } from '../script.js';
import { crossCheck, validateScenes } from '../scenes.js';

/** MiniMax (and similar) may wrap chain-of-thought in these tags. */
function stripReasoning(text) {
  let s = String(text || '');
  // Closed blocks first.
  s = s.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
  s = s.replace(/<reasoning\b[^>]*>[\s\S]*?<\/reasoning>/gi, '');
  // Truncated / unclosed reasoning — drop through end of string.
  s = s.replace(/<think\b[^>]*>[\s\S]*$/gi, '');
  s = s.replace(/<reasoning\b[^>]*>[\s\S]*$/gi, '');
  return s.trim();
}

/**
 * Walk balanced `{...}` objects in `body` (string-aware) and return parseable
 * candidates, preferring ones that look like `{ "script": ..., "scenes": ... }`.
 */
function candidateJsonSlices(body) {
  const out = [];
  const n = body.length;
  for (let i = 0; i < n; i++) {
    if (body[i] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let j = i; j < n; j++) {
      const ch = body[j];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === '\\') {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          out.push(body.slice(i, j + 1));
          break;
        }
      }
    }
  }
  return out;
}

function scoreCandidate(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return -1;
  let score = 0;
  if (typeof obj.script === 'string') score += 2;
  if (obj.scenes && typeof obj.scenes === 'object' && !Array.isArray(obj.scenes)) score += 2;
  return score;
}

export function extractJsonObject(text) {
  const stripped = stripReasoning(text);
  if (!stripped) {
    throw new ApexError('LLM returned empty text', {
      code: 'bad_llm',
      path: 'autogenerate',
      rule: 'json',
    });
  }
  const fence = stripped.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fence ? fence[1] : stripped).trim();
  if (!body.includes('{')) {
    throw new ApexError('LLM reply is not a JSON object', {
      code: 'bad_llm',
      path: 'autogenerate',
      rule: 'json',
      hint: 'The model must return { "script": "...", "scenes": { ... } }.',
    });
  }

  const slices = candidateJsonSlices(body);
  // Prefer later objects (payload usually follows prose / reasoning leftovers).
  let best = null;
  let bestScore = -1;
  let lastError = null;
  for (let i = slices.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(slices[i]);
      const score = scoreCandidate(obj);
      if (score > bestScore) {
        best = obj;
        bestScore = score;
        if (score >= 4) break;
      }
    } catch (e) {
      lastError = e;
    }
  }

  if (best && bestScore >= 0) return best;

  // Legacy fallback: first `{` through last `}` (helps odd truncated replies in tests).
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch (e) {
      lastError = e;
    }
  }

  throw new ApexError(`LLM JSON parse failed: ${lastError?.message || 'no JSON object'}`, {
    code: 'bad_llm',
    path: 'autogenerate',
    rule: 'json',
    hint: 'The model must return { "script": "...", "scenes": { ... } }.',
  });
}

/**
 * MiniMax often puts narration text in `cue` instead of the literal "sentence".
 * Coerce at the LLM boundary; hand-authored scenes.json stays strict in validateScenes.
 */
export function normalizeLlmScenes(scenes) {
  if (!scenes || typeof scenes !== 'object' || Array.isArray(scenes)) return scenes;
  const out = {};
  for (const [id, scene] of Object.entries(scenes)) {
    if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
      out[id] = scene;
      continue;
    }
    const next = { ...scene };
    const layout = String(next.layout || '');
    const hasItems = layout === 'cards' || layout === 'steps' || layout === 'flow';
    if (next.cue !== undefined && next.cue !== null) {
      if (hasItems) {
        // Any non-empty cue means "reveal by sentence"; only "sentence" is valid.
        next.cue = 'sentence';
      } else {
        delete next.cue;
      }
    } else if (hasItems && next.cue == null) {
      // Default for item layouts so reveals work without the model remembering the enum.
      next.cue = 'sentence';
    }
    out[id] = next;
  }
  return out;
}

export function parseLlmExplainer(text) {
  const raw = extractJsonObject(text);
  let script = raw.script;
  let scenes = raw.scenes;
  if (typeof scenes === 'string') {
    try {
      scenes = JSON.parse(scenes);
    } catch (e) {
      throw new ApexError(`scenes is not valid JSON: ${e.message}`, {
        code: 'bad_llm',
        path: 'scenes.json',
        rule: 'json',
      });
    }
  }
  if (typeof script !== 'string' || !script.trim()) {
    throw new ApexError('LLM JSON missing string "script"', {
      code: 'bad_llm',
      path: 'script.md',
      rule: 'required',
    });
  }
  if (!scenes || typeof scenes !== 'object' || Array.isArray(scenes)) {
    throw new ApexError('LLM JSON missing object "scenes"', {
      code: 'bad_llm',
      path: 'scenes.json',
      rule: 'object',
    });
  }
  scenes = normalizeLlmScenes(scenes);
  script = script.endsWith('\n') ? script : script + '\n';
  const parsed = parseScript(script);
  const validated = validateScenes(scenes);
  const notes = crossCheck(parsed, validated);
  return { script, scenes: validated, notes, parsed };
}
