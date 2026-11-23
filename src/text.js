/** Simple canvas text helpers: wrap + measure (CJK-aware). */

const CJK = /[\u3400-\u9FFF\uF900-\uFAFF]/u;

function isBreakOpportunity(ch) {
  return /\s/.test(ch) || CJK.test(ch) || /[，。！？、：；「」『』（）()]/.test(ch);
}

/**
 * Wrap text for Latin (space) or CJK (character) scripts.
 */
export function wrapText(ctx, text, maxWidth) {
  const raw = String(text ?? '');
  if (!raw) return [];
  if (!CJK.test(raw) && !/\S/.test(raw.replace(/\s+/g, ' '))) return [];

  // Prefer space wrapping when the string has whitespace and little CJK.
  const cjkCount = (raw.match(CJK) || []).length;
  if (cjkCount === 0) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines = [];
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const trial = `${line} ${words[i]}`;
      if (ctx.measureText(trial).width <= maxWidth) line = trial;
      else {
        lines.push(line);
        line = words[i];
      }
    }
    lines.push(line);
    return lines;
  }

  const lines = [];
  let line = '';
  for (const ch of raw) {
    if (ch === '\n') {
      if (line) lines.push(line);
      line = '';
      continue;
    }
    const trial = line + ch;
    if (ctx.measureText(trial).width <= maxWidth) {
      line = trial;
      continue;
    }
    if (line) {
      lines.push(line);
      line = /\s/.test(ch) ? '' : ch;
    } else {
      // Single glyph wider than max — still emit it.
      lines.push(ch);
      line = '';
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function measureBlock(ctx, text, { font, maxWidth, lineHeight = 1.25 }) {
  ctx.save();
  ctx.font = font;
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] || 16);
  const lines = wrapText(ctx, text, maxWidth);
  const width = Math.min(
    maxWidth,
    lines.reduce((w, l) => Math.max(w, ctx.measureText(l).width), 0),
  );
  const height = lines.length * size * lineHeight;
  ctx.restore();
  return { lines, width, height, size };
}

export function drawLines(ctx, lines, x, y, { font, color, align = 'left', lineHeight = 1.25 }) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] || 16);
  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + i * size * lineHeight);
  });
  ctx.restore();
  return lines.length * size * lineHeight;
}

void isBreakOpportunity;
