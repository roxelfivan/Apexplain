/** Hard-burn captions (9:16) and SRT export. */
import { fontCss } from './fonts.js';
import { wrapText } from './text.js';

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

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Burned-in caption. Phase 3: stronger contrast (rounded scrim + edge + shadow)
 * and optional bottom inset so the chrome strip stays clear.
 */
export function drawCaption(ctx, text, { width, height, theme, lang = 'en', bottomInset = 0 }) {
  if (!text) return;
  const maxW = width * 0.82;
  const fontSize = Math.round(Math.min(width, height) * 0.038);
  ctx.save();
  ctx.font = fontCss(700, fontSize, lang);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const lines = wrapText(ctx, text, maxW);

  const lineH = fontSize * 1.28;
  const blockH = lines.length * lineH + fontSize * 0.5;
  // Lift captions above the Phase 3 chrome strip when it is on.
  const y0 = Math.max(height * 0.24, height * 0.78 - (Number(bottomInset) || 0));
  const padX = fontSize * 0.62;
  const padY = fontSize * 0.42;
  const boxW = Math.min(
    maxW + padX * 2,
    lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0) + padX * 2,
  );
  const boxX = (width - boxW) / 2;
  const boxY = y0 - blockH;

  // Scrim: rounded, slightly stronger than a plain bar.
  ctx.fillStyle = 'rgba(8,10,14,0.68)';
  roundRectPath(ctx, boxX, boxY, boxW, blockH + fontSize * 0.25, fontSize * 0.32);
  ctx.fill();
  // Hairline edge separates the scrim from light scenes.
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = Math.max(1, Math.round(fontSize * 0.03));
  ctx.stroke();

  // Text with a soft shadow so glyphs stay readable over busy art.
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = Math.round(fontSize * 0.22);
  ctx.shadowOffsetY = Math.round(fontSize * 0.05);
  ctx.fillStyle = '#ffffff';
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
