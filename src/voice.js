/**
 * Per-scene TTS with disk cache. No Whisper — cue times come from
 * measured chunk WAV durations (sentence + #marker boundaries).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ApexError } from './errors.js';
import { joinSpoken, speechChunks } from './script.js';
import { estimateLength, estimateLine } from './timeline.js';
import { loadSpeechEngine } from './tts/index.js';
import { concatAudio, trimSilence, writeWav, readWav } from './wav.js';
import { TTS_MODEL, TTS_SAMPLE_RATE, ttsDtype } from './models.js';

const PIPELINE = 2;
const round = (v) => Math.round(v * 1000) / 1000;

export function voicePaths(project, id) {
  const dir = path.join(project.paths.build, 'voice');
  return {
    dir,
    wav: path.join(dir, `${id}.wav`),
    json: path.join(dir, `${id}.json`),
  };
}

export function sceneVoiceChunks(scene, video) {
  const pace = video.pace || 1;
  return speechChunks(scene.units, {
    sentenceGap: video.sentenceGap ?? 0.3,
    paragraphGap: video.paragraphGap ?? 0.55,
    pace,
    splitOnMarks: true,
  });
}

export function speechHash(scene, chunks, video, engineMeta = {}) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        PIPELINE,
        lang: video.lang || 'en',
        engine: engineMeta.engine || (video.lang === 'zh-HK' ? 'vocello' : 'kokoro'),
        model: engineMeta.model || null,
        dtype: process.env.APEXPLAIN_TTS === 'mock' ? 'mock' : engineMeta.dtype || null,
        voice: video.voice,
        speed: (video.speed || 1) * (video.pace || 1),
        chunks: chunks.map((c) => [c.gapBefore, c.text, c.marks || []]),
      }),
    )
    .digest('hex')
    .slice(0, 16);
}

function readCached(files) {
  try {
    if (!fs.existsSync(files.json) || !fs.existsSync(files.wav)) return null;
    return JSON.parse(fs.readFileSync(files.json, 'utf8'));
  } catch {
    return null;
  }
}

async function renderScene({ scene, chunks, hash, video, tts, paths, log }) {
  const files = voicePaths({ paths }, scene.id);
  fs.mkdirSync(files.dir, { recursive: true });

  if (!chunks.length) {
    const info = {
      hash,
      id: scene.id,
      duration: 0,
      chunks: [],
      marks: {},
      sentences: [],
    };
    if (fs.existsSync(files.wav)) fs.rmSync(files.wav);
    fs.writeFileSync(files.json, JSON.stringify(info, null, 2) + '\n');
    return info;
  }

  const sr = TTS_SAMPLE_RATE;
  const speed = (video.speed || 1) * (video.pace || 1);
  const pieces = [];
  let cursor = 0;
  const chunkInfo = [];
  const marks = {};
  /** @type {Map<number, { index: number, start: number, end: number, texts: string[] }>} */
  const sentenceAcc = new Map();

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const gap = ci === 0 ? 0 : chunk.gapBefore;
    if (gap > 0) {
      pieces.push(new Float32Array(Math.round(gap * sr)));
      cursor += Math.round(gap * sr);
    }

    // Punctuation-only fragments (e.g. lone "。") are not speakable — skip TTS.
    if (!/[\p{L}\p{N}]/u.test(chunk.text)) {
      continue;
    }
    // Same progress shape for EN (Kokoro) and zh-HK (Vocello): one Output line
    // as each chunk finishes. Yield after the start line so SSE can flush before
    // a long Vocello take (async spawn — not spawnSync).
    log(`voice ${scene.id}: chunk ${ci + 1}/${chunks.length}`);
    await new Promise((r) => setImmediate(r));
    const audio = await tts.generate(chunk.text, { voice: video.voice, speed });
    const samples = trimSilence(audio.audio, audio.sampling_rate || sr);
    const start = cursor / sr;
    const dur = samples.length / sr;
    pieces.push(samples);
    cursor += samples.length;
    log(`voice ${scene.id}: chunk ${ci + 1}/${chunks.length} done (${round(dur)}s)`);
    await new Promise((r) => setImmediate(r));

    for (const name of chunk.marks || []) {
      marks[name] = round(start);
    }

    const si = chunk.sentenceIndex ?? 0;
    chunkInfo.push({
      index: ci,
      start: round(start),
      end: round(start + dur),
      dur: round(dur),
      text: chunk.text,
      marks: chunk.marks || [],
      sentence: !!chunk.sentence,
      sentenceIndex: si,
    });

    const acc = sentenceAcc.get(si) || { index: si, start, end: start + dur, texts: [] };
    if (!sentenceAcc.has(si)) acc.start = start;
    acc.end = start + dur;
    acc.texts.push(chunk.text);
    sentenceAcc.set(si, acc);
  }

  const sentences = [...sentenceAcc.values()]
    .sort((a, b) => a.index - b.index)
    .map((s) => ({
      index: s.index,
      start: round(s.start),
      dur: round(s.end - s.start),
      text: s.texts.reduce((a, b) => joinSpoken(a, b), ''),
    }));

  writeWav(files.wav, concatAudio(pieces), sr);

  const info = {
    hash,
    id: scene.id,
    duration: round(cursor / sr),
    sampleRate: sr,
    chunks: chunkInfo,
    marks,
    sentences,
  };
  fs.writeFileSync(files.json, JSON.stringify(info, null, 2) + '\n');
  return info;
}

/**
 * Synthesize all scenes. Returns { [id]: voiceInfo }.
 */
export async function synthesize(project, { force = false, log = () => {} } = {}) {
  const { script, video, paths } = project;
  fs.mkdirSync(path.join(paths.build, 'voice'), { recursive: true });

  const estimate = estimateLength(project);
  if (estimate) log(`voice: ${estimateLine(estimate)}`);

  const engineMeta = {
    engine: video.lang === 'zh-HK' ? 'vocello' : 'kokoro',
    model: video.lang === 'zh-HK' ? 'vocello' : TTS_MODEL,
    dtype:
      process.env.APEXPLAIN_TTS === 'mock'
        ? 'mock'
        : video.lang === 'zh-HK'
          ? 'mlx'
          : ttsDtype(),
  };

  const result = {};
  const todo = [];

  for (const scene of script.scenes) {
    const chunks = sceneVoiceChunks(scene, video);
    const hash = speechHash(scene, chunks, video, engineMeta);
    const files = voicePaths(project, scene.id);
    const cached = readCached(files);
    if (!force && cached?.hash === hash && fs.existsSync(files.wav)) {
      result[scene.id] = cached;
      log(`voice ${scene.id}: cache hit (${cached.duration}s)`);
    } else {
      todo.push({ scene, chunks, hash });
    }
  }

  if (!todo.length) return result;

  const needsSpeech = todo.some((t) => t.chunks.length);
  const tts = needsSpeech ? await loadSpeechEngine(video, { log }) : null;

  try {
    for (const { scene, chunks, hash } of todo) {
      const t0 = Date.now();
      const info = await renderScene({
        scene,
        chunks,
        hash,
        video,
        tts,
        paths,
        log,
      });
      result[scene.id] = info;
      log(
        `voice ${scene.id}: ${info.duration}s` +
          (chunks.length ? ` (${chunks.length} chunk${chunks.length === 1 ? '' : 's'})` : '') +
          `, made in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
    }
  } finally {
    if (tts?.close) await tts.close();
  }

  return result;
}

/**
 * Verify WAV duration matches voice JSON within toleranceMs.
 */
export function verifyVoiceDuration(project, id, { toleranceMs = 50 } = {}) {
  const files = voicePaths(project, id);
  if (!fs.existsSync(files.wav) || !fs.existsSync(files.json)) {
    throw new ApexError(`missing voice for scene "${id}"`, {
      code: 'missing_voice',
      path: `build/voice/${id}.wav`,
      rule: 'voice',
    });
  }
  const info = JSON.parse(fs.readFileSync(files.json, 'utf8'));
  const wav = readWav(files.wav);
  const deltaMs = Math.abs(wav.duration - info.duration) * 1000;
  return { id, wav: wav.duration, json: info.duration, deltaMs, ok: deltaMs <= toleranceMs };
}
