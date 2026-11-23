/**
 * Traditional Chinese (Hong Kong) helpers for zh-HK Autogenerate.
 * Wikipedia zh often returns Simplified; OpenCC converts to HK Traditional.
 */
import * as OpenCC from 'opencc-js';

const toHk = OpenCC.Converter({ from: 'cn', to: 'hk' });

/** Simplified / mixed → Hong Kong Traditional. */
export function toTradHk(text) {
  return toHk(String(text || ''));
}

/**
 * Light Cantonese narration polish on Traditional text.
 * Run after toTradHk so particles replace the Traditional forms.
 */
export function cantoish(text) {
  return String(text || '')
    .replace(/不是/g, '唔係')
    .replace(/沒有/g, '冇')
    .replace(/這/g, '呢')
    .replace(/那/g, '嗰')
    .replace(/嗎/g, '吖')
    .replace(/是/g, '係')
    .replace(/的/g, '嘅')
    .replace(/了/g, '咗')
    .replace(/和/g, '同')
    .replace(/與/g, '同')
    .replace(/它/g, '佢')
    .replace(/他/g, '佢')
    .replace(/她/g, '佢')
    .replace(/們/g, '哋');
}

/** Full zh-HK pipeline for spoken + on-screen copy. */
export function zhHkCopy(text) {
  return cantoish(toTradHk(text));
}
