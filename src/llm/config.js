/**
 * LLM settings for Autogenerate — Local Gemma or MiniMax.
 * Mirrors apeditor Settings: provider picker + API key (MiniMax only).
 * Stored on this machine at ~/.config/apexplain/llm.json (mode 0600).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ApexError } from '../errors.js';

export const LLM_PROVIDERS = [
  {
    id: 'local-gemma',
    label: 'Local Model (require around 2gb disk space)',
    requiresApiKey: false,
    defaultEndpoint: 'https://huggingface.co/onnx-community/gemma-2-2b-it-ONNX',
    defaultModel: 'gemma-2-2b-it',
    modelPresets: [],
    helpText:
      'Free, no API key. Runs Gemma 2 2B Instruct (ONNX, ~2 GB) on this machine via transformers.js. Download once from Hugging Face (Settings or npm run setup:gemma). Prompts stay local.',
    apiKeyPlaceholder: '(not used — no API key required)',
  },
  {
    id: 'minimax',
    label: 'Minimax',
    requiresApiKey: true,
    defaultEndpoint: 'https://api.minimax.io/v1',
    defaultModel: 'MiniMax-M2.7',
    modelPresets: ['MiniMax-M3', 'MiniMax-M3-fast', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'],
    helpText:
      'OpenAI-compatible. A base URL like https://api.minimax.io/v1 is fine — /chat/completions is appended automatically. The key is stored only in this machine’s llm.json and sent as Authorization: Bearer to that HTTPS endpoint.',
    apiKeyPlaceholder: 'Paste your Minimax API key…',
  },
];

export const DEFAULT_LLM = {
  provider: 'local-gemma',
  apiEndpoint: LLM_PROVIDERS[0].defaultEndpoint,
  model: LLM_PROVIDERS[0].defaultModel,
  apiKey: '',
};

export function getLlmProvider(id) {
  return LLM_PROVIDERS.find((p) => p.id === id) || LLM_PROVIDERS[0];
}

export function requiresApiKey(id) {
  return id === 'minimax';
}

export function usesLocalGemma(id) {
  return id === 'local-gemma';
}

export function configDir() {
  if (process.env.APEXPLAIN_CONFIG) return path.resolve(process.env.APEXPLAIN_CONFIG);
  return path.join(os.homedir(), '.config', 'apexplain');
}

export function llmSettingsPath() {
  return path.join(configDir(), 'llm.json');
}

function maskKey(key) {
  const k = String(key || '');
  if (!k) return '';
  if (k.length <= 4) return '••••';
  return `••••${k.slice(-4)}`;
}

export function normalizeLlmSettings(raw = {}) {
  const provider = raw.provider === 'minimax' ? 'minimax' : 'local-gemma';
  const preset = getLlmProvider(provider);
  const endpoint =
    typeof raw.apiEndpoint === 'string' && raw.apiEndpoint.trim()
      ? raw.apiEndpoint.trim()
      : preset.defaultEndpoint;
  const model =
    typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : preset.defaultModel;
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '';
  return { provider, apiEndpoint: endpoint, model, apiKey };
}

export function loadLlmSettings() {
  const file = llmSettingsPath();
  let fromFile = {};
  try {
    if (fs.existsSync(file)) {
      fromFile = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    throw new ApexError(`llm.json is not valid JSON: ${e.message}`, {
      code: 'bad_json',
      path: file,
      rule: 'json',
    });
  }
  const cfg = normalizeLlmSettings(fromFile);
  const envKey = process.env.APEXPLAIN_MINIMAX_API_KEY || process.env.MINIMAX_API_KEY;
  if (envKey && envKey.trim()) cfg.apiKey = envKey.trim();
  return cfg;
}

export function saveLlmSettings(partial = {}) {
  const prev = loadLlmSettings();
  const next = normalizeLlmSettings({
    ...prev,
    ...partial,
    apiKey:
      partial.clearApiKey
        ? ''
        : partial.apiKey != null && String(partial.apiKey).trim()
          ? String(partial.apiKey).trim()
          : prev.apiKey,
  });
  // Switching provider resets endpoint/model when the caller did not send them.
  if (partial.provider && partial.apiEndpoint == null) {
    next.apiEndpoint = getLlmProvider(next.provider).defaultEndpoint;
  }
  if (partial.provider && partial.model == null) {
    next.model = getLlmProvider(next.provider).defaultModel;
  }
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = llmSettingsPath();
  const body = {
    provider: next.provider,
    apiEndpoint: next.apiEndpoint,
    model: next.model,
    apiKey: next.apiKey,
  };
  fs.writeFileSync(file, JSON.stringify(body, null, 2) + '\n', { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* ignore on platforms without chmod */
  }
  return next;
}

export function publicLlmSettings(cfg = loadLlmSettings()) {
  const preset = getLlmProvider(cfg.provider);
  return {
    provider: cfg.provider,
    apiEndpoint: cfg.apiEndpoint,
    model: cfg.model,
    apiKeySet: Boolean(cfg.apiKey),
    apiKeyHint: maskKey(cfg.apiKey),
    requiresApiKey: requiresApiKey(cfg.provider),
    usesLocalGemma: usesLocalGemma(cfg.provider),
    label: preset.label,
    helpText: preset.helpText,
    modelPresets: preset.modelPresets,
    apiKeyPlaceholder: preset.apiKeyPlaceholder,
  };
}
