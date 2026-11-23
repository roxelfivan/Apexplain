/**
 * Five declarative layout renderers. Each pushes boxes onto `els` for QA.
 */
import { drawIcon } from './icons.js';
import { fontCss } from './fonts.js';
import { drawLines, measureBlock } from './text.js';

function box(els, kind, path, x, y, w, h, { fontSize = null, alpha = 1 } = {}) {
  els.push({ kind, path, x, y, w, h, x1: x + w, y1: y + h, fontSize, alpha });
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function itemAlpha(item, index, layout, sceneLocalT, cueTimes) {
  const at = cueTimes?.[index] ?? 0;
  if (sceneLocalT + 1e-6 < at) return 0;
  const fade = 0.35;
  return Math.min(1, (sceneLocalT - at) / fade);
}

function cueTimesFor(layout, sceneTimeline) {
  if (sceneTimeline?.itemCues?.length) {
    return sceneTimeline.itemCues.map((c) => c.at);
  }
  if (!Array.isArray(layout.items)) return [];
  return layout.items.map((it, i) => {
    if (it.marker != null && sceneTimeline?.marks?.[it.marker] != null) {
      return sceneTimeline.marks[it.marker];
    }
    if (it.at != null && sceneTimeline?.sentences?.[it.at]) {
      return sceneTimeline.sentences[it.at].start;
    }
    if (layout.cue === 'sentence' && sceneTimeline?.sentences?.[i]) {
      return sceneTimeline.sentences[i].start;
    }
    return sceneTimeline?.lead ?? 0;
  });
}

export function renderLayout(ctx, layout, {
  safe,
  theme,
  type,
  sceneId,
  sceneLocalT = Infinity,
  sceneTimeline = null,
  lang = 'en',
  els = [],
}) {
  const cues = cueTimesFor(layout, sceneTimeline);
  const opts = { safe, theme, type, sceneId, sceneLocalT, cues, lang, els };
  switch (layout.layout) {
    case 'title':
      return layoutTitle(ctx, layout, opts);
    case 'cards':
      return layoutCards(ctx, layout, opts);
    case 'steps':
      return layoutSteps(ctx, layout, opts);
    case 'compare':
      return layoutCompare(ctx, layout, opts);
    case 'flow':
      return layoutFlow(ctx, layout, opts);
    default:
      break;
  }
}

function layoutTitle(ctx, layout, { safe, theme, type, sceneId, lang = 'en', els }) {
  const titleFont = fontCss('700', type.title, lang);
  const subFont = fontCss('500', type.subtitle, lang);
  const maxW = safe.w * 0.86;
  const title = measureBlock(ctx, layout.title, { font: titleFont, maxWidth: maxW });
  const sub = layout.subtitle
    ? measureBlock(ctx, layout.subtitle, { font: subFont, maxWidth: maxW })
    : null;
  const gap = type.subtitle * 0.6;
  const totalH = title.height + (sub ? gap + sub.height : 0);
  let y = safe.y + (safe.h - totalH) / 2;
  const x = safe.x + (safe.w - title.width) / 2;

  drawLines(ctx, title.lines, safe.x + safe.w / 2, y, {
    font: titleFont,
    color: theme.ink,
    align: 'center',
  });
  box(els, 'title', `scenes.json/${sceneId}/title`, x, y, title.width, title.height, {
    fontSize: type.title,
  });
  y += title.height + gap;
  if (sub) {
    const sx = safe.x + (safe.w - sub.width) / 2;
    drawLines(ctx, sub.lines, safe.x + safe.w / 2, y, {
      font: subFont,
      color: theme.muted,
      align: 'center',
    });
    box(els, 'subtitle', `scenes.json/${sceneId}/subtitle`, sx, y, sub.width, sub.height, {
      fontSize: type.subtitle,
    });
  }
}

function layoutSteps(ctx, layout, { safe, theme, type, sceneId, sceneLocalT, cues, lang = 'en', els }) {
  const items = layout.items || [];
  const bodyFont = fontCss('500', type.body, lang);
  const iconSize = type.body * 1.4;
  const rowGap = type.body * 0.85;
  const maxW = safe.w * 0.72;
  const blocks = items.map((it) =>
    measureBlock(ctx, it.text, { font: bodyFont, maxWidth: maxW - iconSize - type.body }),
  );
  const totalH =
    blocks.reduce((s, b) => s + Math.max(b.height, iconSize), 0) + rowGap * Math.max(0, items.length - 1);
  let y = safe.y + Math.max(0, (safe.h - totalH) / 2);
  const x = safe.x + (safe.w - maxW) / 2;

  items.forEach((it, i) => {
    const alpha = itemAlpha(it, i, layout, sceneLocalT, cues);
    if (alpha <= 0) {
      y += Math.max(blocks[i].height, iconSize) + rowGap;
      return;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    const h = Math.max(blocks[i].height, iconSize);
    if (it.icon) {
      drawIcon(ctx, it.icon, x + iconSize / 2, y + h / 2, iconSize, theme.accent);
      box(els, 'icon', `scenes.json/${sceneId}/items/${i}/icon`, x, y, iconSize, iconSize, { alpha });
    }
    const tx = x + iconSize + type.body * 0.6;
    drawLines(ctx, blocks[i].lines, tx, y + (h - blocks[i].height) / 2, {
      font: bodyFont,
      color: theme.ink,
    });
    box(els, 'text', `scenes.json/${sceneId}/items/${i}/text`, tx, y, blocks[i].width, blocks[i].height, {
      fontSize: type.body,
      alpha,
    });
    ctx.restore();
    y += h + rowGap;
  });
}

function layoutCards(ctx, layout, { safe, theme, type, sceneId, sceneLocalT, cues, lang = 'en', els }) {
  const items = layout.items || [];
  const cols = Math.min(3, Math.max(1, items.length));
  const gap = type.body * 0.7;
  const cardW = (safe.w - gap * (cols - 1)) / cols;
  const bodyFont = fontCss('500', type.body, lang);
  const iconSize = type.body * 1.6;
  const pad = type.body * 0.7;

  const rows = Math.ceil(items.length / cols);
  const cardHeights = items.map((it) => {
    const m = measureBlock(ctx, it.text, { font: bodyFont, maxWidth: cardW - pad * 2 });
    return pad + (it.icon ? iconSize + pad * 0.5 : 0) + m.height + pad;
  });
  const rowH = [];
  for (let r = 0; r < rows; r++) {
    let max = 0;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (i < items.length) max = Math.max(max, cardHeights[i]);
    }
    rowH.push(max);
  }
  const totalH = rowH.reduce((s, h) => s + h, 0) + gap * Math.max(0, rows - 1);
  let y0 = safe.y + Math.max(0, (safe.h - totalH) / 2);

  items.forEach((it, i) => {
    const alpha = itemAlpha(it, i, layout, sceneLocalT, cues);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = safe.x + col * (cardW + gap);
    let y = y0;
    for (let r = 0; r < row; r++) y += rowH[r] + gap;
    const h = rowH[row];
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = theme.card;
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, cardW, h, Math.min(18, h / 6));
    ctx.fill();
    ctx.stroke();
    box(els, 'card', `scenes.json/${sceneId}/items/${i}`, x, y, cardW, h, { alpha });

    let cy = y + pad;
    if (it.icon) {
      drawIcon(ctx, it.icon, x + cardW / 2, cy + iconSize / 2, iconSize, theme.accent);
      cy += iconSize + pad * 0.5;
    }
    const m = measureBlock(ctx, it.text, { font: bodyFont, maxWidth: cardW - pad * 2 });
    drawLines(ctx, m.lines, x + cardW / 2, cy, {
      font: bodyFont,
      color: theme.ink,
      align: 'center',
    });
    box(els, 'text', `scenes.json/${sceneId}/items/${i}/text`, x + pad, cy, m.width, m.height, {
      fontSize: type.body,
      alpha,
    });
    ctx.restore();
  });
}

function layoutCompare(ctx, layout, { safe, theme, type, sceneId, lang = 'en', els }) {
  const gap = type.body * 0.8;
  const colW = (safe.w - gap) / 2;
  const pad = type.body * 0.75;
  const titleFont = fontCss('700', type.subtitle, lang);
  const bodyFont = fontCss('500', type.body, lang);

  const drawSide = (side, key, x) => {
    const title = side.title
      ? measureBlock(ctx, side.title, { font: titleFont, maxWidth: colW - pad * 2 })
      : null;
    const body = measureBlock(ctx, side.text, { font: bodyFont, maxWidth: colW - pad * 2 });
    const iconSize = side.icon ? type.body * 1.5 : 0;
    const h =
      pad +
      (iconSize ? iconSize + pad * 0.4 : 0) +
      (title ? title.height + pad * 0.35 : 0) +
      body.height +
      pad;
    const y = safe.y + (safe.h - h) / 2;

    ctx.fillStyle = theme.card;
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, colW, h, 18);
    ctx.fill();
    ctx.stroke();
    box(els, 'card', `scenes.json/${sceneId}/${key}`, x, y, colW, h);

    let cy = y + pad;
    if (side.icon) {
      drawIcon(ctx, side.icon, x + colW / 2, cy + iconSize / 2, iconSize, theme.accent);
      cy += iconSize + pad * 0.4;
    }
    if (title) {
      drawLines(ctx, title.lines, x + colW / 2, cy, {
        font: titleFont,
        color: theme.accent,
        align: 'center',
      });
      box(els, 'title', `scenes.json/${sceneId}/${key}/title`, x + pad, cy, title.width, title.height, {
        fontSize: type.subtitle,
      });
      cy += title.height + pad * 0.35;
    }
    drawLines(ctx, body.lines, x + colW / 2, cy, {
      font: bodyFont,
      color: theme.ink,
      align: 'center',
    });
    box(els, 'text', `scenes.json/${sceneId}/${key}/text`, x + pad, cy, body.width, body.height, {
      fontSize: type.body,
    });
  };

  drawSide(layout.left, 'left', safe.x);
  drawSide(layout.right, 'right', safe.x + colW + gap);
}

function layoutFlow(ctx, layout, { safe, theme, type, sceneId, sceneLocalT, cues, lang = 'en', els }) {
  const items = layout.items || [];
  const bodyFont = fontCss('500', type.body, lang);
  const pad = type.body * 0.55;
  const gap = type.body * 0.55;
  const arrow = type.body * 0.9;
  const maxChip = safe.w * 0.22;

  const chips = items.map((it) => {
    const m = measureBlock(ctx, it.text, { font: bodyFont, maxWidth: maxChip });
    return {
      ...m,
      w: Math.min(maxChip, m.width + pad * 2),
      h: m.height + pad * 2,
      icon: it.icon,
    };
  });

  const totalW =
    chips.reduce((s, c) => s + c.w, 0) + gap * Math.max(0, items.length - 1) + arrow * Math.max(0, items.length - 1);
  // If too wide, stack vertically.
  const stack = totalW > safe.w;

  if (stack) {
    const rowGap = type.body * 0.7;
    const totalH = chips.reduce((s, c) => s + c.h, 0) + rowGap * Math.max(0, items.length - 1);
    let y = safe.y + Math.max(0, (safe.h - totalH) / 2);
    items.forEach((it, i) => {
      const alpha = itemAlpha(it, i, layout, sceneLocalT, cues);
      const c = chips[i];
      const x = safe.x + (safe.w - c.w) / 2;
      if (alpha > 0) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = theme.card;
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, c.w, c.h, 14);
        ctx.fill();
        ctx.stroke();
        drawLines(ctx, c.lines, x + c.w / 2, y + pad, {
          font: bodyFont,
          color: theme.ink,
          align: 'center',
        });
        box(els, 'chip', `scenes.json/${sceneId}/items/${i}`, x, y, c.w, c.h, {
          fontSize: type.body,
          alpha,
        });
        ctx.restore();
      }
      y += c.h + rowGap;
    });
    return;
  }

  let x = safe.x + (safe.w - totalW) / 2;
  const maxH = Math.max(...chips.map((c) => c.h));
  const y = safe.y + (safe.h - maxH) / 2;

  items.forEach((it, i) => {
    const alpha = itemAlpha(it, i, layout, sceneLocalT, cues);
    const c = chips[i];
    if (alpha > 0) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = theme.card;
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, c.w, c.h, 14);
      ctx.fill();
      ctx.stroke();
      drawLines(ctx, c.lines, x + c.w / 2, y + pad, {
        font: bodyFont,
        color: theme.ink,
        align: 'center',
      });
      box(els, 'chip', `scenes.json/${sceneId}/items/${i}`, x, y, c.w, c.h, {
        fontSize: type.body,
        alpha,
      });
      ctx.restore();
    }
    x += c.w + gap;
    if (i < items.length - 1) {
      ctx.save();
      ctx.globalAlpha = Math.min(
        itemAlpha(it, i, layout, sceneLocalT, cues),
        itemAlpha(items[i + 1], i + 1, layout, sceneLocalT, cues),
      );
      if (ctx.globalAlpha > 0) {
        ctx.strokeStyle = theme.muted;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y + c.h / 2);
        ctx.lineTo(x + arrow - 6, y + c.h / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + arrow - 14, y + c.h / 2 - 8);
        ctx.lineTo(x + arrow - 6, y + c.h / 2);
        ctx.lineTo(x + arrow - 14, y + c.h / 2 + 8);
        ctx.stroke();
      }
      ctx.restore();
      x += arrow;
    }
  });
}
