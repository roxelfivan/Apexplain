/**
 * Local Gemma 2 2B Instruct via transformers.js (ONNX), cached like Kokoro.
 * ~2 GB once; Autogenerate stays on-device after setup.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ApexError } from '../errors.js';
import { cacheRoot } from '../models.js';

export const GEMMA_MODEL = 'onnx-community/gemma-2-2b-it-ONNX';
export const GEMMA_DTYPE = 'q4';
export const GEMMA_SIZE_LABEL = '~2 GB';
export const GEMMA_MODEL_LABEL = 'gemma-2-2b-it';
export const GEMMA_MODEL_PAGE_URL =
  'https://huggingface.co/onnx-community/gemma-2-2b-it-ONNX';

export function gemmaModelDir() {
  return path.join(cacheRoot(), 'models', ...GEMMA_MODEL.split('/'));
}

export function gemmaOnnxPath() {
  return path.join(gemmaModelDir(), 'onnx', 'model_q4.onnx');
}

export function probeGemma() {
  const dir = gemmaModelDir();
  const onnx = gemmaOnnxPath();
  const tokenizer = path.join(dir, 'tokenizer.json');
  const missing = [];
  if (!fs.existsSync(onnx)) missing.push(`missing ONNX q4: ${onnx}`);
  if (!fs.existsSync(tokenizer)) missing.push(`missing tokenizer: ${tokenizer}`);
  const ok = missing.length === 0;
  return {
    ok,
    detail: ok
      ? `offline ready (${GEMMA_MODEL_LABEL} ${GEMMA_DTYPE}, cache=${cacheRoot()})`
      : missing.join('; '),
    model: GEMMA_MODEL,
    dtype: GEMMA_DTYPE,
    sizeLabel: GEMMA_SIZE_LABEL,
    onnx,
    cache: cacheRoot(),
    pageUrl: GEMMA_MODEL_PAGE_URL,
    fix: ok ? undefined : 'Open Settings → Download, or run npm run setup:gemma',
  };
}

let pipelinePromise = null;

export async function loadGemma({ log = () => {}, allowHf = false } = {}) {
  if (process.env.APEXPLAIN_LLM === 'mock') {
    throw new ApexError('APEXPLAIN_LLM=mock does not load Gemma', {
      code: 'llm_mock',
      rule: 'mock',
    });
  }
  const local = probeGemma().ok;
  const hf = allowHf || process.env.APEXPLAIN_ALLOW_HF === '1';
  if (!local && !hf) {
    throw new ApexError(
      `Local Gemma weights missing at ${gemmaOnnxPath()}`,
      {
        code: 'missing_gemma',
        path: gemmaOnnxPath(),
        rule: 'exists',
        hint: 'Open Settings and download Local Gemma, or run npm run setup:gemma.',
      },
    );
  }
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = path.join(cacheRoot(), 'models');
      env.allowRemoteModels = hf;
      env.allowLocalModels = true;
      fs.mkdirSync(env.cacheDir, { recursive: true });
      log(`loading Gemma (${GEMMA_MODEL}, dtype=${GEMMA_DTYPE}${hf ? ', may download' : ', local only'})…`);
      const generator = await pipeline('text-generation', GEMMA_MODEL, {
        dtype: GEMMA_DTYPE,
        device: 'cpu',
        progress_callback: (p) => {
          if (p?.status === 'progress' && p.file) {
            log(`gemma: ${p.file} ${Math.round(p.progress || 0)}%`);
          }
        },
      });
      log(`Gemma ready (${GEMMA_DTYPE}, local)`);
      return generator;
    })();
    pipelinePromise.catch(() => {
      pipelinePromise = null;
    });
  }
  return pipelinePromise;
}

function toGemmaPrompt(messages) {
  const parts = [];
  for (const m of messages || []) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const content = String(m.content || '').trim();
    if (!content) continue;
    parts.push(`<start_of_turn>${role}\n${content}<end_of_turn>`);
  }
  parts.push('<start_of_turn>model\n');
  return parts.join('\n');
}

export async function completeGemma(messages, _settings, { log = () => {}, signal, maxTokens } = {}) {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  const generator = await loadGemma({ log });
  const prompt = toGemmaPrompt(messages);
  // Default was 1600 — far too small for targetSeconds-sized script.md + scenes.json.
  const tokens = Math.max(1600, Math.min(8192, Number(maxTokens) || 3200));
  log(`llm: local Gemma generating (max_new_tokens=${tokens})…`);
  const out = await generator(prompt, {
    max_new_tokens: tokens,
    temperature: 0.2,
    do_sample: false,
    return_full_text: false,
  });
  const text = Array.isArray(out) ? out[0]?.generated_text : out?.generated_text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new ApexError('Local Gemma returned an empty completion', {
      code: 'llm_gemma',
      path: 'autogenerate',
      rule: 'empty',
    });
  }
  return text;
}

export function resetGemmaPipelineForTests() {
  pipelinePromise = null;
}
