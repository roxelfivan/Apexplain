/**
 * Language-aware TTS loader.
 * English: Kokoro. zh-HK: Vocello CLI (Qwen3-TTS Voice Design, Cantonese brief).
 */
import { loadTTS as loadKokoro, TTS_MODEL, ttsDtype } from '../models.js';
import { loadTtsSettings } from './config.js';
import { VOCELLO_ENGINE, createVocelloWorker } from './vocello.js';

export async function loadSpeechEngine(video, { log = () => {}, settings } = {}) {
  const ttsCfg = settings || loadTtsSettings();

  if ((video.lang || 'en') === 'zh-HK') {
    log('loading Vocello (zh-HK / Cantonese design)…');
    const worker = createVocelloWorker({ log, settings: ttsCfg });
    return {
      engine: worker.engine || VOCELLO_ENGINE,
      model: VOCELLO_ENGINE,
      dtype: process.env.APEXPLAIN_TTS === 'mock' ? 'mock' : 'mlx',
      ttsSettings: ttsCfg,
      design: worker.design,
      async generate(text, opts) {
        return worker.generate(text, opts);
      },
      async generateMany(texts, opts) {
        if (typeof worker.generateMany === 'function') {
          return worker.generateMany(texts, opts);
        }
        const out = [];
        for (const t of texts || []) out.push(await worker.generate(t, opts));
        return out;
      },
      async close() {
        await worker.close();
      },
    };
  }

  const tts = await loadKokoro({ log });
  const defaultVoice = ttsCfg.kokoro.voice;
  const defaultSpeed = ttsCfg.kokoro.speed;
  return {
    engine: 'kokoro',
    model: TTS_MODEL,
    dtype: process.env.APEXPLAIN_TTS === 'mock' ? 'mock' : ttsDtype(),
    ttsSettings: ttsCfg,
    async generate(text, opts = {}) {
      const voice = opts.voice || video.voice || defaultVoice;
      const speed = opts.speed != null ? opts.speed : defaultSpeed;
      return tts.generate(text, { ...opts, voice, speed });
    },
    async generateMany(texts, opts = {}) {
      const out = [];
      for (const t of texts || []) out.push(await this.generate(t, opts));
      return out;
    },
    async close() {},
  };
}
