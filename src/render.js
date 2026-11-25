/**
 * Full video render: frames → H.264, mux with scene voice tracks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { captionAt, drawCaption, toSrt } from './captions.js';
import { chapterAt, chromeGeometry, drawProgressChrome, resolveChapters } from './chrome.js';
import { createFrameContext, drawSceneFrame } from './engine.js';
import { ApexError } from './errors.js';
import { frameEncoder, runFfmpeg } from './ffmpeg.js';
import { concatAudio, readWav, writeWav } from './wav.js';
import { voicePaths } from './voice.js';

/**
 * Build a single mono WAV matching the timeline (lead + voice + hold per scene).
 */
export function buildSoundtrack(project, timeline) {
  const sampleRate = 24000;
  const pieces = [];
  let cursor = 0;

  const silence = (sec) => new Float32Array(Math.max(0, Math.round(sec * sampleRate)));

  for (const sc of timeline.scenes) {
    const targetStart = Math.round(sc.start * sampleRate);
    if (cursor < targetStart) {
      pieces.push(silence((targetStart - cursor) / sampleRate));
      cursor = targetStart;
    }

    const leadSamples = silence(sc.lead || 0);
    pieces.push(leadSamples);
    cursor += leadSamples.length;

    if (sc.voice?.dur > 0) {
      const files = voicePaths(project, sc.id);
      if (!fs.existsSync(files.wav)) {
        throw new ApexError(`missing voice wav for "${sc.id}"`, {
          code: 'missing_voice',
          path: `build/voice/${sc.id}.wav`,
          rule: 'voice',
        });
      }
      const wav = readWav(files.wav);
      let samples = wav.samples;
      if (wav.sampleRate !== sampleRate) {
        const ratio = wav.sampleRate / sampleRate;
        const out = new Float32Array(Math.floor(samples.length / ratio));
        for (let i = 0; i < out.length; i++) out[i] = samples[Math.floor(i * ratio)];
        samples = out;
      }
      pieces.push(samples);
      cursor += samples.length;
    }

    const sceneEnd = Math.round((sc.start + sc.dur) * sampleRate);
    if (cursor < sceneEnd) {
      pieces.push(silence((sceneEnd - cursor) / sampleRate));
      cursor = sceneEnd;
    }
  }

  const totalFrames = Math.round(timeline.duration * sampleRate);
  if (cursor < totalFrames) pieces.push(silence((totalFrames - cursor) / sampleRate));

  const audio = concatAudio(pieces);
  const out = path.join(project.paths.build, 'soundtrack.wav');
  fs.mkdirSync(project.paths.build, { recursive: true });
  writeWav(out, audio.subarray(0, Math.min(audio.length, totalFrames)), sampleRate);
  return out;
}

function sceneAt(timeline, t) {
  for (let i = timeline.scenes.length - 1; i >= 0; i--) {
    const sc = timeline.scenes[i];
    if (t + 1e-6 >= sc.start) return sc;
  }
  return timeline.scenes[0];
}

/**
 * Render MP4 + SRT.
 */
export async function renderVideo(project, timeline, { draft = false, log = () => {} } = {}) {
  const fps = timeline.fps || project.video.fps || 30;
  const frames = timeline.frames || Math.round(timeline.duration * fps);
  const burnCaptions =
    project.video.size === '9:16' ||
    project.video.captions === true ||
    project.video.captions === 'on' ||
    (project.video.captions === 'auto' && project.video.size === '9:16');

  fs.mkdirSync(project.paths.out, { recursive: true });
  fs.mkdirSync(project.paths.build, { recursive: true });

  const videoOnly = path.join(project.paths.build, 'video-silent.mp4');
  const soundtrack = buildSoundtrack(project, timeline);
  const frameCtx = createFrameContext(project.video);
  const { width, height, theme, safe, type } = frameCtx;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Phase 3 chrome: opt-in chapter/progress strip below the safe area.
  const chapters = resolveChapters({
    video: project.video,
    timeline,
    storyboard: project.storyboard || '',
  });
  const geo = chromeGeometry({ width, height, safe, type });
  const captionInset = chapters.enabled ? geo.inset : 0;
  if (chapters.enabled) {
    log(
      `render: chrome on — ${chapters.items.length} chapter(s)` +
        (chapters.items.some((c) => c.label) ? '' : ' (progress bar only)'),
    );
  }

  log(`render: ${frames} frames at ${fps} fps (${width}x${height})` + (draft ? ' draft' : ''));
  const enc = frameEncoder({ fps, out: videoOnly, draft });
  const t0 = Date.now();

  try {
    for (let f = 0; f < frames; f++) {
      const t = f / fps;
      const sc = sceneAt(timeline, t);
      const localT = Math.max(0, t - sc.start);
      drawSceneFrame(ctx, {
        video: project.video,
        sceneId: sc.id,
        layout: project.scenes[sc.id],
        sceneTimeline: sc,
        t: localT,
        width,
        height,
        theme,
        safe,
        type,
      });
      if (chapters.enabled) {
        drawProgressChrome(ctx, {
          chapters,
          progress: timeline.duration ? t / timeline.duration : 0,
          chapterIndex: chapterAt(chapters, t),
          width,
          height,
          theme,
          safe,
          type,
          lang: project.video.lang || 'en',
        });
      }
      if (burnCaptions) {
        drawCaption(ctx, captionAt(sc, localT), {
          width,
          height,
          theme,
          lang: project.video.lang || 'en',
          bottomInset: captionInset,
        });
      }
      await enc.write(canvas.toBuffer('image/jpeg', draft ? 70 : 85));
      if (f > 0 && f % Math.max(1, Math.floor(fps * 3)) === 0) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = f / Math.max(elapsed, 0.01);
        const left = (frames - f) / rate;
        log(`render: frame ${f}/${frames} (~${Math.round(left)}s left)`);
      }
    }
    await enc.close();
  } catch (e) {
    enc.kill();
    throw e;
  }

  log('render: muxing audio');
  const out = project.paths.outVideo;
  await runFfmpeg([
    '-i',
    videoOnly,
    '-i',
    soundtrack,
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    out,
  ]);

  const srtPath = path.join(project.paths.out, 'video.srt');
  fs.writeFileSync(srtPath, toSrt(timeline));

  const secs = (Date.now() - t0) / 1000;
  log(`render: wrote ${out} in ${secs.toFixed(1)}s`);

  return {
    out,
    srt: srtPath,
    duration: timeline.duration,
    frames,
    seconds: secs,
  };
}
