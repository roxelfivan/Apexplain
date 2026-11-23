import fs from 'node:fs';
import path from 'node:path';
import { ApexError } from './errors.js';
import { displayPath, loadProject } from './project.js';
import {
  buildEstimatedTimeline,
  buildMeasuredTimeline,
  estimateLine,
} from './timeline.js';
import { checkProjectLayouts } from './engine.js';
import { renderVideo } from './render.js';
import { synthesize, verifyVoiceDuration } from './voice.js';

function writeTimeline(paths, timeline) {
  fs.mkdirSync(paths.build, { recursive: true });
  const file = path.join(paths.build, 'timeline.json');
  fs.writeFileSync(file, JSON.stringify(timeline, null, 2) + '\n');
  return file;
}

function logLine(msg) {
  process.stderr.write(msg + '\n');
}

/**
 * Validate + estimate. Writes build/timeline.json (estimated).
 */
export function makeDryRun(dir, { estimateOnly = false, log = logLine } = {}) {
  const { paths, video, script, scenes, notes } = loadProject(dir);
  const timeline = buildEstimatedTimeline({ script, video, scenes });
  const timelineFile = writeTimeline(paths, timeline);
  const estimate = timeline.estimate;
  const relTimeline = displayPath(timelineFile);

  const sceneIds = script.scenes.map((s) => s.id);
  const lines = [];
  const push = (line) => {
    lines.push(line);
    log(line);
  };

  if (!estimateOnly) {
    push(`dry-run ${displayPath(paths.root)}`);
    push(
      `parsed ${sceneIds.length} scene${sceneIds.length === 1 ? '' : 's'} from script.md` +
        (sceneIds.length ? ` (${sceneIds.join(', ')})` : ''),
    );
    push(
      `scenes.json: ${Object.keys(scenes).length} layout${Object.keys(scenes).length === 1 ? '' : 's'} validated`,
    );
    push(
      `title: ${video.title ?? '(none)'} · lang: ${video.lang || 'en'} · size: ${video.size} · theme: ${video.theme}`,
    );
    for (const sc of script.scenes) {
      const layout = scenes[sc.id]?.layout;
      const marks = Object.keys(sc.marks);
      const sec = estimate?.sceneSeconds?.[sc.id];
      push(
        `  ${sc.id}: layout=${layout}, sentences=${sc.sentenceCount}` +
          (sec != null ? `, ~${sec}s` : '') +
          (marks.length ? `, markers=${marks.join(',')}` : ''),
      );
    }
    for (const note of notes) push(`note: ${note}`);
  } else {
    push(`estimate ${displayPath(paths.root)}`);
  }

  if (estimate) {
    push(estimateLine(estimate));
    const cueCount = timeline.cues.length;
    push(
      `timeline: ${timeline.scenes.length} scenes, ${cueCount} cue${cueCount === 1 ? '' : 's'}, ~${timeline.duration}s → ${relTimeline}`,
    );
  } else {
    push('no narration to estimate');
  }

  let layoutChecks = [];
  if (!estimateOnly) {
    layoutChecks = checkProjectLayouts({ paths, video, script, scenes, notes }, timeline);
    push(`layout: ok (${layoutChecks.length} scene${layoutChecks.length === 1 ? '' : 's'})`);
    push('ok: schema + layout valid');
  }

  return {
    ok: true,
    dryRun: !estimateOnly,
    estimateOnly,
    dir: paths.root,
    scenes: sceneIds,
    layouts: Object.fromEntries(Object.entries(scenes).map(([id, s]) => [id, s.layout])),
    video: {
      title: video.title,
      lang: video.lang || 'en',
      size: video.size,
      theme: video.theme,
    },
    estimate,
    layoutChecks,
    timeline: {
      file: timelineFile,
      duration: timeline.duration,
      scenes: timeline.scenes.length,
      cues: timeline.cues.length,
      kind: timeline.kind,
    },
    notes,
    message: lines.join('\n'),
  };
}

/**
 * Run Kokoro TTS (cached), write measured timeline.
 */
export async function makeVoiceOnly(dir, { force = false, log = logLine } = {}) {
  const project = loadProject(dir);
  const voices = await synthesize(project, { force, log });
  const timeline = buildMeasuredTimeline(project, voices);
  const timelineFile = writeTimeline(project.paths, timeline);

  const checks = project.script.scenes.map((s) =>
    verifyVoiceDuration(project, s.id, { toleranceMs: 50 }),
  );
  const bad = checks.filter((c) => !c.ok);
  if (bad.length) {
    throw new ApexError(
      `voice duration mismatch: ${bad.map((b) => `${b.id} Δ${b.deltaMs.toFixed(1)}ms`).join(', ')}`,
      { code: 'voice_mismatch', rule: 'duration', hint: 'Re-run with --force' },
    );
  }

  const lines = [
    `voice-only ${displayPath(project.paths.root)}`,
    ...project.script.scenes.map((s) => {
      const v = voices[s.id];
      return `  ${s.id}: ${v.duration}s, ${v.chunks?.length ?? 0} chunks, markers=${Object.keys(v.marks || {}).join(',') || '—'}`;
    }),
    `timeline: measured ${timeline.duration}s, ${timeline.cues.length} cues → ${displayPath(timelineFile)}`,
    `ok: voice durations match WAVs (±50ms)`,
  ];

  return {
    ok: true,
    voiceOnly: true,
    dir: project.paths.root,
    voices: Object.fromEntries(
      Object.entries(voices).map(([id, v]) => [id, { duration: v.duration, chunks: v.chunks?.length ?? 0 }]),
    ),
    checks,
    timeline: {
      file: timelineFile,
      duration: timeline.duration,
      scenes: timeline.scenes.length,
      cues: timeline.cues.length,
      kind: timeline.kind,
    },
    message: lines.join('\n'),
  };
}

/**
 * Full pipeline: validate → voice → layout-check → render → mux.
 */
export async function makeFull(dir, { force = false, draft = false, log = logLine } = {}) {
  const project = loadProject(dir);
  log(`make ${displayPath(project.paths.root)}`);

  // Layout check on estimated timeline first (cheap fail before TTS).
  const estimated = buildEstimatedTimeline(project);
  checkProjectLayouts(project, estimated);

  const voices = await synthesize(project, { force, log });
  const timeline = buildMeasuredTimeline(project, voices);
  writeTimeline(project.paths, timeline);

  for (const s of project.script.scenes) {
    const check = verifyVoiceDuration(project, s.id, { toleranceMs: 50 });
    if (!check.ok) {
      throw new ApexError(`voice duration mismatch on ${s.id}`, {
        code: 'voice_mismatch',
        rule: 'duration',
      });
    }
  }

  // Re-check layouts against measured cue times.
  checkProjectLayouts(project, timeline);

  const rendered = await renderVideo(project, timeline, { draft, log });

  const lines = [
    `make ${displayPath(project.paths.root)}`,
    `voice: ${project.script.scenes.length} scenes`,
    `video: ${displayPath(rendered.out)} (${rendered.duration.toFixed(1)}s, ${rendered.frames} frames)`,
    `srt: ${displayPath(rendered.srt)}`,
    `ok: wrote MP4 in ${rendered.seconds.toFixed(1)}s`,
  ];

  return {
    ok: true,
    dir: project.paths.root,
    out: rendered.out,
    srt: rendered.srt,
    duration: rendered.duration,
    frames: rendered.frames,
    seconds: rendered.seconds,
    timeline: {
      duration: timeline.duration,
      scenes: timeline.scenes.length,
      cues: timeline.cues.length,
      kind: timeline.kind,
    },
    message: lines.join('\n'),
  };
}

export async function make(dir, opts = {}) {
  const log = opts.log || logLine;
  if (opts.voiceOnly) return makeVoiceOnly(dir, { force: !!opts.force, log });
  if (opts.dryRun || opts.estimate) {
    return makeDryRun(dir, {
      estimateOnly: !!opts.estimate && !opts.dryRun,
      log,
    });
  }
  return makeFull(dir, { force: !!opts.force, draft: !!opts.draft, log });
}
