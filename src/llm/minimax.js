/**
 * MiniMax Chat Completions (OpenAI-compatible), same wire format as apeditor.
 */
import { ApexError } from '../errors.js';
import { getLlmProvider } from './config.js';

function chatUrl(endpoint) {
  const base = String(endpoint || getLlmProvider('minimax').defaultEndpoint).replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) return base;
  return `${base}/chat/completions`;
}

export async function completeMinimax(messages, settings, { log = () => {}, signal, maxTokens } = {}) {
  const key = settings?.apiKey?.trim();
  if (!key) {
    throw new ApexError('Minimax API key is missing', {
      code: 'llm_config',
      path: 'settings/apiKey',
      rule: 'required',
      hint: 'Open Settings, choose Minimax, paste your API key, and Save.',
    });
  }
  const url = chatUrl(settings.apiEndpoint);
  const model = settings.model || getLlmProvider('minimax').defaultModel;
  const tokens = Math.max(2048, Math.min(16384, Number(maxTokens) || 4096));
  log(`llm: MiniMax ${model} (max_tokens=${tokens})`);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        max_tokens: tokens,
      }),
      signal: signal || AbortSignal.timeout(180000),
    });
  } catch (e) {
    throw new ApexError(`Minimax request failed: ${e.message}`, {
      code: 'llm_http',
      path: 'settings/apiEndpoint',
      rule: 'fetch',
    });
  }
  const raw = await res.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new ApexError(`Minimax returned non-JSON (${res.status})`, {
      code: 'llm_http',
      path: 'settings/apiEndpoint',
      rule: 'json',
    });
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || raw.slice(0, 240);
    throw new ApexError(`Minimax ${res.status}: ${msg}`, {
      code: 'llm_http',
      path: 'settings/apiKey',
      rule: 'http',
      hint: res.status === 401 ? 'Check the API key in Settings.' : undefined,
    });
  }
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new ApexError('Minimax returned an empty completion', {
      code: 'llm_http',
      path: 'autogenerate',
      rule: 'empty',
    });
  }
  return text;
}
