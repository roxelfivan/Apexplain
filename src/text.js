/** Simple canvas text helpers: wrap + measure. */

export function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
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
