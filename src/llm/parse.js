/**
 * Parse Autogenerate LLM output into script.md + scenes.json.
 */
import { ApexError } from '../errors.js';
import { parseScript } from '../script.js';
import { crossCheck, validateScenes } from '../scenes.js';

export function extractJsonObject(text) {
  const s = String(text || '').trim();
  if (!s) {
    throw new ApexError('LLM returned empty text', {
      code: 'bad_llm',
      path: 'autogenerate',
      rule: 'json',
    });
  }
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fence ? fence[1] : s).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new ApexError('LLM reply is not a JSON object', {
      code: 'bad_llm',
      path: 'autogenerate',
      rule: 'json',
      hint: 'The model must return { "script": "...", "scenes": { ... } }.',
    });
  }
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch (e) {
    throw new ApexError(`LLM JSON parse failed: ${e.message}`, {
      code: 'bad_llm',
      path: 'autogenerate',
      rule: 'json',
    });
  }
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
  script = script.endsWith('\n') ? script : script + '\n';
  const parsed = parseScript(script);
  const validated = validateScenes(scenes);
  const notes = crossCheck(parsed, validated);
  return { script, scenes: validated, notes, parsed };
}
