/** Hard-burn captions (9:16) and SRT export. */

export function captionAt(scene, localT) {
  const sentences = scene?.sentences || [];
  if (!sentences.length) return null;
  let cur = sentences[0];
  for (const s of sentences) {
    if (localT + 1e-6 >= s.start) cur = s;
    else break;
  }
  // Hold through sentence duration + a little slack into the next gap.
  const end = cur.start + Math.max(cur.dur || 0.4, 0.4);
  if (localT > end + 0.35 && localT < (sentences[cur.index + 1]?.start ?? Infinity)) {
    // still show until next sentence starts
  }
  if (localT + 1e-6 < cur.start) return null;
  return cur.text;
}

export function drawCaption(ctx, text, { width, height, theme }) {
  if (!text) return;
  const maxW = width * 0.82;
  const fontSize = Math.round(Math.min(width, height) * 0.035);
  ctx.save();
  ctx.font = `700 ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (ctx.measureText(trial).width <= maxW) line = trial;
    else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);

  const lineH = fontSize * 1.25;
  const blockH = lines.length * lineH + fontSize * 0.5;
  const y0 = height * 0.78;
  const padX = fontSize * 0.6;
  const boxW = Math.min(
    maxW + padX * 2,
    lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0) + padX * 2,
  );
  const boxX = (width - boxW) / 2;
  const boxY = y0 - blockH;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(boxX, boxY, boxW, blockH + fontSize * 0.25);
  ctx.fillStyle = theme?.ink === '#1a1d24' ? '#ffffff' : '#ffffff';
  lines.forEach((l, i) => {
    ctx.fillText(l, width / 2, y0 - (lines.length - 1 - i) * lineH);
  });
  ctx.restore();
}

export function toSrt(timeline) {
  const cues = [];
  let n = 1;
  for (const sc of timeline.scenes) {
    for (const sent of sc.sentences || []) {
      const start = sc.start + sent.start;
      const end = start + Math.max(sent.dur || 0.5, 0.4);
      cues.push({ n: n++, start, end, text: sent.text });
    }
  }
  return cues
    .map((c) => `${c.n}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`)
    .join('\n');
}

function ts(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(ms).padStart(3, '0')}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}
