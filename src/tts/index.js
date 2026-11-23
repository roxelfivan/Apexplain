/**
 * Language-aware TTS loader.
 * English: Kokoro. zh-HK: Vocello CLI (Qwen3-TTS Voice Design, Cantonese brief).
 */
import { loadTTS as loadKokoro, TTS_MODEL, ttsDtype } from '../models.js';
import { VOCELLO_ENGINE, createVocelloWorker } from './vocello.js';

export async function loadSpeechEngine(video, { log = () => {} } = {}) {
  if ((video.lang || 'en') === 'zh-HK') {
    log('loading Vocello (zh-HK / Cantonese design)…');
    const worker = createVocelloWorker({ log });
    return {
      engine: worker.engine || VOCELLO_ENGINE,
      model: VOCELLO_ENGINE,
      dtype: process.env.APEXPLAIN_TTS === 'mock' ? 'mock' : 'mlx',
      async generate(text, opts) {
        return worker.generate(text, opts);
      },
      async close() {
        await worker.close();
      },
    };
  }

  const tts = await loadKokoro({ log });
  return {
    engine: 'kokoro',
    model: TTS_MODEL,
    dtype: process.env.APEXPLAIN_TTS === 'mock' ? 'mock' : ttsDtype(),
    async generate(text, opts) {
      return tts.generate(text, opts);
    },
    async close() {},
  };
}
