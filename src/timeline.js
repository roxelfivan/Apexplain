/**
 * Duration estimates and synthetic timelines (no TTS yet).
 * Letter rate and spread follow explainroo's Kokoro-tuned constants.
 */
import { speechChunks } from './script.js';

const LETTERS_A_SECOND = 12.7;
/** Approximate HK Cantonese speaking rate (Han chars / sec) for estimates. */
const CJK_CHARS_A_SECOND = 4.6;
const SPREAD = 0.06;
const LETTERS_A_DIGIT = 4;
const DEFAULT_SENTENCE_GAP = 0.3;
const DEFAULT_PARAGRAPH_GAP = 0.55;

const VOICE_RATES = {
  af_heart: 1,
  af_bella: 0.95,
  af_nicole: 0.62,
  af_aoede: 1.01,
  af_kore: 0.97,
  af_sarah: 0.99,
  af_nova: 1.04,
  af_alloy: 0.98,
  af_jessica: 1.11,
  af_river: 1.09,
  am_michael: 0.88,
  am_fenrir: 0.97,
  am_puck: 0.97,
  am_echo: 0.99,
  am_eric: 1.09,
  am_liam: 1.05,
  am_onyx: 1.03,
  am_santa: 0.87,
  bf_emma: 1.02,
  bf_alice: 0.96,
  bf_lily: 0.97,
  bm_george: 0.87,
  bm_fable: 0.9,
  bm_lewis: 0.91,
};

const tenth = (v) => Math.round(v * 10) / 10;
const round3 = (v) => Math.round(v * 1000) / 1000;

function spokenWordCount(text, lang = 'en') {
  if (lang === 'zh-HK') {
    return (String(text).match(/[\p{L}\p{N}]/gu) || []).length;
  }
  return String(text)
    .split(/\s+/)
    .filter((w) => w && /[\p{L}\p{N}]/u.test(w)).length;
}

function letterWeight(text) {
  return (
    (String(text).match(/\p{L}/gu) || []).length +
    LETTERS_A_DIGIT * (String(text).match(/\p{N}/gu) || []).length
  );
}

function cjkWeight(text) {
  return (
    (String(text).match(/[\u3400-\u9FFF\uF900-\uFAFF]/gu) || []).length +
    LETTERS_A_DIGIT * (String(text).match(/\p{N}/gu) || []).length +
    (String(text).match(/[A-Za-z]/gu) || []).length
  );
}

function talkSeconds(text, factor, lang = 'en') {
  if (lang === 'zh-HK') {
    return cjkWeight(text) / (CJK_CHARS_A_SECOND * factor);
  }
  return letterWeight(text) / (LETTERS_A_SECOND * factor);
}

function voiceFactor(video) {
  const pace = video.pace || 1;
  const speed = video.speed || 1;
  if (video.lang === 'zh-HK') {
    return Math.max(0.5, speed * pace);
  }
  // Kokoro default speed is 0.9; match explainroo's scaling.
  const normal = 0.9;
  return ((speed * pace) / normal) ** 0.65 * (VOICE_RATES[video.voice] ?? 1);
}

function sceneGaps(scene, video) {
  const pace = video.pace || 1;
  const chunks = speechChunks(scene.units, {
    sentenceGap: video.sentenceGap ?? DEFAULT_SENTENCE_GAP,
    paragraphGap: video.paragraphGap ?? DEFAULT_PARAGRAPH_GAP,
    pace,
  });
  const gaps = chunks.slice(1).reduce((n, c) => n + c.gapBefore, 0);
  return { chunks, gaps };
}

/**
 * Estimate total length from script + video.json (no audio).
 */
export function estimateLength({ script, video }) {
  const pace = video.pace || 1;
  const factor = voiceFactor(video);
  const lang = video.lang || 'en';
  let words = 0;
  let speech = 0;
  let leads = 0;
  let narrated = 0;
  let pauses = 0;
  let total = 0;
  const sceneSeconds = {};

  script.scenes.forEach((scene, index) => {
    const a = scene.attrs;
    const isLast = index === script.scenes.length - 1;
    const count = spokenWordCount(scene.spoken, lang);
    let dur;
    if (count) {
      const talk = talkSeconds(scene.spoken, factor, lang);
      const { gaps } = sceneGaps(scene, video);
      const around = ((a.lead ?? video.lead) + (a.hold ?? video.hold)) / pace;
      dur = around + (isLast ? video.end / pace : 0) + talk + gaps;
      words += count;
      speech += talk;
      leads += around;
      narrated++;
      pauses += gaps;
    } else {
      dur = ((a.min ?? 3) + (isLast ? video.end : 0)) / pace;
    }
    if (a.min) dur = Math.max(dur, a.min / pace);
    dur = Math.max(dur, 1);
    total += dur;
    sceneSeconds[scene.id] = tenth(dur);
  });

  if (!words) return null;

  const end = video.end / pace;
  return {
    seconds: tenth(total),
    low: tenth(total - speech + speech / (1 + SPREAD)),
    high: tenth(total - speech + speech / (1 - SPREAD)),
    words,
    unitLabel: lang === 'zh-HK' ? 'chars' : 'words',
    perMinute: Math.round((words / speech) * 60),
    speechSeconds: tenth(speech),
    perScene: Math.round((leads / narrated) * 100) / 100,
    scenes: narrated,
    pauses: tenth(pauses),
    end: tenth(end),
    other: tenth(Math.max(0, total - speech - leads - pauses - end)),
    sceneSeconds,
    ...(video.targetSeconds ? { targetSeconds: video.targetSeconds } : {}),
  };
}

export function estimateLine(e) {
  if (!e) return 'no narration to estimate';
  const range =
    e.low === undefined
      ? ''
      : ` (${Math.min(Math.round(e.seconds), Math.floor(e.low))} to ${Math.max(Math.round(e.seconds), Math.ceil(e.high))} s)`;
  const scenes =
    e.scenes === 1
      ? `The scene adds ${e.perScene} s for its lead and hold`
      : `The ${e.scenes} scenes add ${e.perScene} s each for their lead and hold`;
  const pauses = e.pauses ? `, and the pauses between sentences add ${e.pauses.toFixed(1)} s` : '';
  const other = e.other
    ? ` Scenes with a min, or without narration, add ${e.other.toFixed(1)} s more.`
    : '';
  const unit = e.unitLabel || 'words';
  let line = `about ${Math.round(e.seconds)} s${range}: ${e.words} ${unit} of speech at about ${e.perMinute} a minute take ${e.speechSeconds.toFixed(1)} s. ${scenes}${pauses}. The end of the video adds ${e.end.toFixed(1)} s.${other}`;
  if (e.targetSeconds) {
    const over = e.seconds - e.targetSeconds;
    if (over > 0.5) {
      line += ` That is about ${Math.round(over)} s over targetSeconds ${e.targetSeconds}, so cut about ${Math.max(1, Math.round((over / 60) * e.perMinute))} words.`;
    } else {
      line += ` The holds get longer to reach targetSeconds ${e.targetSeconds}.`;
    }
  }
  return line;
}

/**
 * Build a synthetic timeline: scene starts, sentence starts from letter
 * proportions, markers at the start of their target sentence.
 */
export function buildEstimatedTimeline({ script, video, scenes: layouts }) {
  const pace = video.pace || 1;
  const factor = voiceFactor(video);
  const lang = video.lang || 'en';
  const weightFn = lang === 'zh-HK' ? cjkWeight : letterWeight;
  const fps = video.fps || 30;
  const snap = (t) => Math.round(t * fps) / fps;

  const outScenes = [];
  const cues = [];
  let t = 0;

  script.scenes.forEach((scene, index) => {
    const a = scene.attrs;
    const isLast = index === script.scenes.length - 1;
    const lead = scene.spoken ? (a.lead ?? video.lead) / pace : 0;
    const hold = ((a.hold ?? video.hold) + (isLast ? video.end : 0)) / pace;
    const { chunks, gaps } = sceneGaps(scene, video);

    const weights = chunks.map((c) => Math.max(1, weightFn(c.text)));
    const totalWeight = weights.reduce((s, w) => s + w, 0) || 1;
    const talk = scene.spoken ? talkSeconds(scene.spoken, factor, lang) : 0;

    // Distribute talk time across sentence chunks by letter weight; place gaps between.
    const sentences = [];
    let cursor = 0;
    chunks.forEach((chunk, i) => {
      if (i > 0) cursor += chunk.gapBefore;
      const dur = talk * (weights[i] / totalWeight);
      const start = cursor;
      sentences.push({
        index: i,
        start: round3(start),
        dur: round3(dur),
        text: chunk.text,
      });
      cursor += dur;
    });

    const voiceDur = scene.spoken ? talk + gaps : 0;
    let dur = voiceDur ? lead + voiceDur + hold : ((a.min ?? 3) + (isLast ? video.end : 0)) / pace;
    if (a.min) dur = Math.max(dur, a.min / pace);
    dur = Math.max(snap(dur), 1);

    const start = snap(t);
    const marks = {};
    for (const [name, sentenceIndex] of Object.entries(scene.marks)) {
      const sent = sentences[Math.min(sentenceIndex, Math.max(0, sentences.length - 1))];
      marks[name] = round3(lead + (sent?.start ?? 0));
    }

    // Layout cues: sentence index or marker → time within scene.
    const layout = layouts?.[scene.id];
    const itemCues = [];
    if (layout && Array.isArray(layout.items)) {
      layout.items.forEach((item, i) => {
        let at;
        if (item.marker != null && marks[item.marker] != null) {
          at = marks[item.marker];
        } else if (item.at != null && sentences[item.at]) {
          at = lead + sentences[item.at].start;
        } else if (layout.cue === 'sentence' && sentences[i]) {
          at = lead + sentences[i].start;
        } else {
          at = lead;
        }
        itemCues.push({ item: i, at: round3(at), text: item.text });
      });
    }

    outScenes.push({
      id: scene.id,
      index,
      start,
      dur: round3(dur),
      lead: round3(lead),
      hold: round3(hold),
      voiceDur: round3(voiceDur),
      text: scene.text,
      sentences: sentences.map((s) => ({
        ...s,
        start: round3(lead + s.start),
      })),
      marks,
      itemCues,
      layout: layout?.layout ?? null,
    });

    cues.push(
      { scene: scene.id, type: 'scene', at: start },
      ...Object.entries(marks).map(([name, at]) => ({
        scene: scene.id,
        type: 'marker',
        name,
        at: round3(start + at),
      })),
      ...itemCues.map((c) => ({
        scene: scene.id,
        type: 'item',
        item: c.item,
        at: round3(start + c.at),
      })),
    );

    t = start + dur;
  });

  const estimate = estimateLength({ script, video });
  return {
    kind: 'estimated',
    fps,
    width: video.size === '9:16' ? 1080 : 1920,
    height: video.size === '9:16' ? 1920 : 1080,
    duration: snap(t),
    frames: Math.round(snap(t) * fps),
    estimate,
    scenes: outScenes,
    cues,
  };
}

/**
 * Timeline from measured voice chunk durations (Phase 4).
 * @param {{ script, video, scenes }} project
 * @param {Record<string, { duration: number, marks: object, sentences: array, chunks?: array }>} voices
 */
export function buildMeasuredTimeline({ script, video, scenes: layouts }, voices) {
  const pace = video.pace || 1;
  const fps = video.fps || 30;
  const snap = (t) => Math.round(t * fps) / fps;

  const outScenes = [];
  const cues = [];
  let t = 0;

  script.scenes.forEach((scene, index) => {
    const a = scene.attrs;
    const isLast = index === script.scenes.length - 1;
    const v = voices[scene.id] || { duration: 0, marks: {}, sentences: [] };
    const lead = v.duration ? (a.lead ?? video.lead) / pace : 0;
    const hold = ((a.hold ?? video.hold) + (isLast ? video.end : 0)) / pace;
    let dur = v.duration
      ? lead + v.duration + hold
      : ((a.min ?? 3) + (isLast ? video.end : 0)) / pace;
    if (a.min) dur = Math.max(dur, a.min / pace);
    dur = Math.max(snap(dur), 1);

    const start = snap(t);
    const marks = Object.fromEntries(
      Object.entries(v.marks || {}).map(([k, m]) => [k, round3(lead + m)]),
    );
    const sentences = (v.sentences || []).map((s) => ({
      index: s.index,
      start: round3(lead + s.start),
      dur: round3(s.dur),
      text: s.text,
    }));

    const layout = layouts?.[scene.id];
    const itemCues = [];
    if (layout && Array.isArray(layout.items)) {
      layout.items.forEach((item, i) => {
        let at;
        if (item.marker != null && marks[item.marker] != null) {
          at = marks[item.marker];
        } else if (item.at != null && sentences[item.at]) {
          at = sentences[item.at].start;
        } else if (layout.cue === 'sentence' && sentences[i]) {
          at = sentences[i].start;
        } else {
          at = lead;
        }
        itemCues.push({ item: i, at: round3(at), text: item.text });
      });
    }

    outScenes.push({
      id: scene.id,
      index,
      start,
      dur: round3(dur),
      lead: round3(lead),
      hold: round3(hold),
      voiceDur: round3(v.duration || 0),
      voice: v.duration
        ? { url: `build/voice/${scene.id}.wav`, start: start + lead, dur: v.duration }
        : null,
      text: scene.text,
      sentences,
      marks,
      itemCues,
      layout: layout?.layout ?? null,
    });

    cues.push(
      { scene: scene.id, type: 'scene', at: start },
      ...Object.entries(marks).map(([name, at]) => ({
        scene: scene.id,
        type: 'marker',
        name,
        at: round3(start + at),
      })),
      ...itemCues.map((c) => ({
        scene: scene.id,
        type: 'item',
        item: c.item,
        at: round3(start + c.at),
      })),
    );

    t = start + dur;
  });

  return {
    kind: 'measured',
    fps,
    width: video.size === '9:16' ? 1080 : 1920,
    height: video.size === '9:16' ? 1920 : 1080,
    duration: snap(t),
    frames: Math.round(snap(t) * fps),
    scenes: outScenes,
    cues,
  };
}
