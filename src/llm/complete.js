import { ApexError } from '../errors.js';
import { loadLlmSettings, requiresApiKey, usesLocalGemma } from './config.js';
import { completeGemma, probeGemma } from './gemma.js';
import { completeMinimax } from './minimax.js';

export function llmReady(settings = loadLlmSettings()) {
  if (process.env.APEXPLAIN_LLM === 'mock') {
    return { ok: true, provider: 'mock', detail: 'stub Autogenerate (APEXPLAIN_LLM=mock)' };
  }
  if (usesLocalGemma(settings.provider)) {
    const g = probeGemma();
    return {
      ok: g.ok,
      provider: 'local-gemma',
      detail: g.detail,
      fix: g.fix,
    };
  }
  if (requiresApiKey(settings.provider)) {
    const ok = Boolean(settings.apiKey);
    return {
      ok,
      provider: 'minimax',
      detail: ok ? 'Minimax API key set' : 'Minimax API key missing',
      fix: ok ? undefined : 'Open Settings, paste your MiniMax API key, and Save.',
    };
  }
  return { ok: false, provider: settings.provider, detail: 'unknown LLM provider' };
}

export async function completeChat(messages, { log = () => {}, settings, signal } = {}) {
  const cfg = settings || loadLlmSettings();
  const ready = llmReady(cfg);
  if (!ready.ok) {
    throw new ApexError(ready.detail, {
      code: 'llm_config',
      path: 'settings',
      rule: 'llm',
      hint: ready.fix,
    });
  }
  if (usesLocalGemma(cfg.provider)) {
    return completeGemma(messages, cfg, { log, signal });
  }
  return completeMinimax(messages, cfg, { log, signal });
}
