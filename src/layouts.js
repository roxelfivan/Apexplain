/**
 * Declarative layout renderers. Each pushes boxes onto `els` for QA.
 */
import { drawClipart } from './clipart.js';
import { drawIcon } from './icons.js';
import { fontCss } from './fonts.js';
import {
  DEFAULT_MOTION,
  drawOnMotion,
  formatCountUpMotion,
  softInMotion,
  stagger,
} from './motion.js';
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

function cueAt(index, cueTimes, fallback = 0) {
  return cueTimes?.[index] ?? fallback;
}

/** Cue time plus optional per-index stagger from motion config. */
function itemAt(index, cueTimes, motion, fallback = 0) {
  return cueAt(index, cueTimes, fallback) + stagger(index, motion?.stagger ?? 0);
}

function cueTimesFor(layout, sceneTimeline) {
  if (sceneTimeline?.itemCues?.length) {
    return sceneTimeline.itemCues.map((c) => c.at);
  }
  const targets = Array.isArray(layout.items)
    ? layout.items
    : layout.layout === 'chart' && Array.isArray(layout.series)
      ? layout.series
      : layout.layout === 'compare'
        ? [layout.left, layout.right].filter(Boolean)
        : [];
  if (!targets.length) return [];
  return targets.map((it, i) => {
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

function drawGlyph(ctx, { icon, clipart }, cx, cy, size, theme, preferClipart = true) {
  if (preferClipart && clipart) {
    drawClipart(ctx, clipart, cx, cy, size, { accent: theme.accent, ink: theme.ink });
    return 'clipart';
  }
  if (icon) {
    drawIcon(ctx, icon, cx, cy, size, theme.accent);
    return 'icon';
  }
  if (clipart) {
    drawClipart(ctx, clipart, cx, cy, size, { accent: theme.accent, ink: theme.ink });
    return 'clipart';
  }
  return null;
}

function withSoftIn(ctx, sceneLocalT, at, motion, draw) {
  const { alpha, dy } = softInMotion(sceneLocalT, at, motion);
  if (alpha <= 0) return { alpha: 0, dy };
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(0, dy);
  draw(alpha, dy);
  ctx.restore();
  return { alpha, dy };
}

export function renderLayout(ctx, layout, {
  safe,
  theme,
  type,
  sceneId,
  sceneLocalT = Infinity,
  sceneTimeline = null,
  lang = 'en',
  motion = DEFAULT_MOTION,
  els = [],
}) {
  const cues = cueTimesFor(layout, sceneTimeline);
  const opts = { safe, theme, type, sceneId, sceneLocalT, cues, lang, motion, els, sceneTimeline };
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
    case 'stat':
      return layoutStat(ctx, layout, opts);
    case 'chart':
      return layoutChart(ctx, layout, opts);
    case 'timeline':
      return layoutTimeline(ctx, layout, opts);
    case 'quote':
      return layoutQuote(ctx, layout, opts);
    case 'funnel':
      return layoutFunnel(ctx, layout, opts);
    default:
      break;
  }
}

function layoutTitle(ctx, layout, { safe, theme, type, sceneId, sceneLocalT, lang = 'en', motion, els, sceneTimeline }) {
  const at = sceneTimeline?.lead ?? 0;
  const titleFont = fontCss('700', type.title, lang);
  const subFont = fontCss('500', type.subtitle, lang);
  const maxW = safe.w * 0.86;
  const title = measureBlock(ctx, layout.title, { font: titleFont, maxWidth: maxW });
  const sub = layout.subtitle
    ? measureBlock(ctx, layout.subtitle, { font: subFont, maxWidth: maxW })
    : null;
  // Hero ≥ ~30% content height when clipart present
  const hero = layout.clipart ? Math.min(safe.h * 0.36, safe.w * 0.28) : 0;
  const gap = type.subtitle * 0.6;
  const totalH = (hero ? hero + gap : 0) + title.height + (sub ? gap + sub.height : 0);
  let y = safe.y + (safe.h - totalH) / 2;

  withSoftIn(ctx, sceneLocalT, at, motion, () => {
    let cy = y;
    if (layout.clipart) {
      drawClipart(ctx, layout.clipart, safe.x + safe.w / 2, cy + hero / 2, hero, {
        accent: theme.accent,
        ink: theme.ink,
      });
      box(els, 'clipart', `scenes.json/${sceneId}/clipart`, safe.x + safe.w / 2 - hero / 2, cy, hero, hero);
      cy += hero + gap;
    }
    const x = safe.x + (safe.w - title.width) / 2;
    drawLines(ctx, title.lines, safe.x + safe.w / 2, cy, {
      font: titleFont,
      color: theme.ink,
      align: 'center',
    });
    box(els, 'title', `scenes.json/${sceneId}/title`, x, cy, title.width, title.height, {
      fontSize: type.title,
    });
    cy += title.height + gap;
    if (sub) {
      const sx = safe.x + (safe.w - sub.width) / 2;
      drawLines(ctx, sub.lines, safe.x + safe.w / 2, cy, {
        font: subFont,
        color: theme.muted,
        align: 'center',
      });
      box(els, 'subtitle', `scenes.json/${sceneId}/subtitle`, sx, cy, sub.width, sub.height, {
        fontSize: type.subtitle,
      });
    }
  });
}

function layoutSteps(ctx, layout, { safe, theme, type, sceneId, sceneLocalT, cues, lang = 'en', motion, els }) {
  const items = layout.items || [];
  const bodyFont = fontCss('500', type.body, lang);
  const hasClip = items.some((it) => it.clipart);
  const iconSize = hasClip ? type.body * 2.6 : type.body * 1.4;
  const rowGap = type.body * 0.85;
  const maxW = safe.w * 0.78;
  const textMax = maxW - iconSize - type.body;
  const blocks = items.map((it) => measureBlock(ctx, it.text, { font: bodyFont, maxWidth: textMax }));
  const totalH =
    blocks.reduce((s, b) => s + Math.max(b.height, iconSize), 0) + rowGap * Math.max(0, items.length - 1);
  let y = safe.y + Math.max(0, (safe.h - totalH) / 2);
  const x = safe.x + (safe.w - maxW) / 2;

  items.forEach((it, i) => {
    const at = itemAt(i, cues, motion);
    const h = Math.max(blocks[i].height, iconSize);
    const rowY = y;
    y += h + rowGap;
    withSoftIn(ctx, sceneLocalT, at, motion, (alpha) => {
      const kind = drawGlyph(ctx, it, x + iconSize / 2, rowY + h / 2, iconSize, theme);
      if (kind) {
        box(els, kind, `scenes.json/${sceneId}/items/${i}/${kind}`, x, rowY, iconSize, iconSize, { alpha });
      }
      const tx = x + iconSize + type.body * 0.6;
      drawLines(ctx, blocks[i].lines, tx, rowY + (h - blocks[i].height) / 2, {
        font: bodyFont,
        color: theme.ink,
      });
      box(els, 'text', `scenes.json/${sceneId}/items/${i}/text`, tx, rowY, blocks[i].width, blocks[i].height, {
        fontSize: type.body,
        alpha,
      });
    });
  });
}

function layoutCards(ctx, layout, { safe, theme, type, sceneId, sceneLocalT, cues, lang = 'en', motion, els }) {
  const items = layout.items || [];
  const bodyFont = fontCss('500', type.body, lang);

  // Single clipart card → hero composition (large illustration + short text)
  if (items.length === 1 && items[0].clipart) {
    const it = items[0];
    const at = itemAt(0, cues, motion);
    const hero = Math.min(safe.h * 0.42, safe.w * 0.34);
    const pad = type.body * 0.8;
    const m = measureBlock(ctx, it.text, { font: bodyFont, maxWidth: safe.w * 0.7 });
    const cardW = Math.min(safe.w * 0.72, Math.max(hero + pad * 2, m.width + pad * 2));
    const cardH = pad + hero + pad * 0.5 + m.height + pad;
    const x = safe.x + (safe.w - cardW) / 2;
    const y = safe.y + (safe.h - cardH) / 2;
    withSoftIn(ctx, sceneLocalT, at, motion, (alpha) => {
      ctx.fillStyle = theme.card;
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, cardW, cardH, 20);
      ctx.fill();
      ctx.stroke();
      box(els, 'card', `scenes.json/${sceneId}/items/0`, x, y, cardW, cardH, { alpha });
      drawClipart(ctx, it.clipart, x + cardW / 2, y + pad + hero / 2, hero, {
        accent: theme.accent,
        ink: theme.ink,
      });
      box(
        els,
        'clipart',
        `scenes.json/${sceneId}/items/0/clipart`,
        x + cardW / 2 - hero / 2,
        y + pad,
        hero,
        hero,
        { alpha },
      );
      const ty = y + pad + hero + pad * 0.5;
      drawLines(ctx, m.lines, x + cardW / 2, ty, {
        font: bodyFont,
        color: theme.ink,
        align: 'center',
      });
      box(els, 'text', `scenes.json/${sceneId}/items/0/text`, x + pad, ty, m.width, m.height, {
        fontSize: type.body,
        alpha,
      });
    });
    return;
  }

  const cols = Math.min(3, Math.max(1, items.length));
  const gap = type.body * 0.7;
  const cardW = (safe.w - gap * (cols - 1)) / cols;
  const pad = type.body * 0.7;
  const rows = Math.ceil(items.length / cols);
  const cardHeights = items.map((it) => {
    const glyph = it.clipart ? type.body * 3.2 : it.icon ? type.body * 1.6 : 0;
    const m = measureBlock(ctx, it.text, { font: bodyFont, maxWidth: cardW - pad * 2 });
    return pad + (glyph ? glyph + pad * 0.5 : 0) + m.height + pad;
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
  const y0 = safe.y + Math.max(0, (safe.h - totalH) / 2);

  items.forEach((it, i) => {
    const at = itemAt(i, cues, motion);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = safe.x + col * (cardW + gap);
    let y = y0;
    for (let r = 0; r < row; r++) y += rowH[r] + gap;
    const h = rowH[row];

    withSoftIn(ctx, sceneLocalT, at, motion, (alpha) => {
      ctx.fillStyle = theme.card;
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, cardW, h, Math.min(18, h / 6));
      ctx.fill();
      ctx.stroke();
      box(els, 'card', `scenes.json/${sceneId}/items/${i}`, x, y, cardW, h, { alpha });

      let cy = y + pad;
      const glyphSize = it.clipart ? type.body * 3.2 : it.icon ? type.body * 1.6 : 0;
      if (glyphSize) {
        const kind = drawGlyph(ctx, it, x + cardW / 2, cy + glyphSize / 2, glyphSize, theme);
        if (kind) {
          box(
            els,
            kind,
            `scenes.json/${sceneId}/items/${i}/${kind}`,
            x + cardW / 2 - glyphSize / 2,
            cy,
            glyphSize,
            glyphSize,
            { alpha },
          );
        }
        cy += glyphSize + pad * 0.5;
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
    });
  });
}

function layoutCompare(ctx, layout, { safe, theme, type, sceneId, sceneLocalT, cues, lang = 'en', motion, els }) {
  const gap = type.body * 0.8;
  const colW = (safe.w - gap) / 2;
  const pad = type.body * 0.75;
  const titleFont = fontCss('700', type.subtitle, lang);
  const bodyFont = fontCss('500', type.body, lang);
  const cued = layout.cue === 'sentence' || cues?.length >= 2;

  const drawSide = (side, key, index, x) => {
    const at = cued ? itemAt(index, cues, motion) : 0;
    const title = side.title
      ? measureBlock(ctx, side.title, { font: titleFont, maxWidth: colW - pad * 2 })
      : null;
    const body = measureBlock(ctx, side.text, { font: bodyFont, maxWidth: colW - pad * 2 });
    const glyphSize = side.clipart ? Math.min(safe.h * 0.22, type.body * 3.2) : side.icon ? type.body * 1.5 : 0;
    const h =
      pad +
      (glyphSize ? glyphSize + pad * 0.4 : 0) +
      (title ? title.height + pad * 0.35 : 0) +
      body.height +
      pad;
    const y = safe.y + (safe.h - h) / 2;

    withSoftIn(ctx, sceneLocalT, at, motion, (alpha) => {
      ctx.fillStyle = theme.card;
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, colW, h, 18);
      ctx.fill();
      ctx.stroke();
      box(els, 'card', `scenes.json/${sceneId}/${key}`, x, y, colW, h, { alpha });

      let cy = y + pad;
      if (glyphSize) {
        const kind = drawGlyph(ctx, side, x + colW / 2, cy + glyphSize / 2, glyphSize, theme);
        if (kind) {
          box(
            els,
            kind,
            `scenes.json/${sceneId}/${key}/${kind}`,
            x + colW / 2 - glyphSize / 2,
            cy,
            glyphSize,
            glyphSize,
            { alpha },
          );
        }
        cy += glyphSize + pad * 0.4;
      }
      if (title) {
        drawLines(ctx, title.lines, x + colW / 2, cy, {
          font: titleFont,
          color: theme.accent,
          align: 'center',
        });
        box(els, 'title', `scenes.json/${sceneId}/${key}/title`, x + pad, cy, title.width, title.height, {
          fontSize: type.subtitle,
          alpha,
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
        alpha,
      });
    });
  };

  drawSide(layout.left, 'left', 0, safe.x);
  drawSide(layout.right, 'right', 1, safe.x + colW + gap);
}

function layoutFlow(ctx, layout, { safe, theme, type, sceneId, sceneLocalT, cues, lang = 'en', motion, els }) {
  const rawItems = layout.items || [];
  // Dense pipelines: item clipart chips blow the safe area when stacked — icons only.
  const allowItemClipart = rawItems.length <= 3;
  const items = allowItemClipart
    ? rawItems
    : rawItems.map((it) => {
        if (!it || !it.clipart) return it;
        const { clipart: _drop, ...rest } = it;
        return rest;
      });
  const gap = type.body * 0.55;
  const arrow = type.body * 0.9;
  const maxChip = safe.w * 0.22;

  let bodyPx = type.body;
  let pad = bodyPx * 0.55;
  let glyphSize = bodyPx * 1.5;
  let rowGap = bodyPx * 0.7;
  let bodyFont = fontCss('500', bodyPx, lang);
  let chips = [];
  let stack = false;
  let totalW = 0;

  const measureChips = () => {
    chips = items.map((it) => {
      const m = measureBlock(ctx, it.text, { font: bodyFont, maxWidth: maxChip });
      const hasGlyph = !!(it.clipart || it.icon);
      return {
        ...m,
        w: Math.min(maxChip, Math.max(m.width + pad * 2, hasGlyph ? glyphSize + pad * 2 : 0)),
        h: m.height + pad * 2 + (hasGlyph ? glyphSize + pad * 0.35 : 0),
        hasGlyph,
      };
    });
    totalW =
      chips.reduce((s, c) => s + c.w, 0) +
      gap * Math.max(0, items.length - 1) +
      arrow * Math.max(0, items.length - 1);
    stack = totalW > safe.w;
  };

  measureChips();
  // Shrink until a vertical stack fits the safe height (Autogenerate often emits 5–7 steps).
  for (let guard = 0; guard < 8; guard++) {
    measureChips();
    if (!stack) break;
    const totalH = chips.reduce((s, c) => s + c.h, 0) + rowGap * Math.max(0, items.length - 1);
    if (totalH <= safe.h) break;
    bodyPx = Math.max(type.minReadable || 18, bodyPx * 0.9);
    pad = bodyPx * 0.5;
    glyphSize = bodyPx * 1.35;
    rowGap = bodyPx * 0.55;
    bodyFont = fontCss('500', bodyPx, lang);
  }

  const drawChip = (it, i, x, y, c) => {
    const at = itemAt(i, cues, motion);
    withSoftIn(ctx, sceneLocalT, at, motion, (alpha) => {
      ctx.fillStyle = theme.card;
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, c.w, c.h, 14);
      ctx.fill();
      ctx.stroke();
      let ty = y + pad;
      if (c.hasGlyph) {
        const kind = drawGlyph(ctx, it, x + c.w / 2, ty + glyphSize / 2, glyphSize, theme, allowItemClipart);
        if (kind) {
          box(
            els,
            kind,
            `scenes.json/${sceneId}/items/${i}/${kind}`,
            x + c.w / 2 - glyphSize / 2,
            ty,
            glyphSize,
            glyphSize,
            { alpha },
          );
        }
        ty += glyphSize + pad * 0.35;
      }
      drawLines(ctx, c.lines, x + c.w / 2, ty, {
        font: bodyFont,
        color: theme.ink,
        align: 'center',
      });
      box(els, 'chip', `scenes.json/${sceneId}/items/${i}`, x, y, c.w, c.h, {
        fontSize: bodyPx,
        alpha,
      });
    });
  };

  const drawArrow = (x0, yMid, i) => {
    const atNext = itemAt(i + 1, cues, motion);
    const p = drawOnMotion(sceneLocalT, atNext, motion);
    if (p <= 0) return;
    const len = (arrow - 6) * p;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p * 1.2);
    ctx.strokeStyle = theme.muted;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, yMid);
    ctx.lineTo(x0 + len, yMid);
    ctx.stroke();
    if (p > 0.85) {
      ctx.beginPath();
      ctx.moveTo(x0 + len - 8, yMid - 8);
      ctx.lineTo(x0 + len, yMid);
      ctx.lineTo(x0 + len - 8, yMid + 8);
      ctx.stroke();
    }
    ctx.restore();
  };

  if (stack) {
    const totalH = chips.reduce((s, c) => s + c.h, 0) + rowGap * Math.max(0, items.length - 1);
    let y = safe.y + Math.max(0, (safe.h - totalH) / 2);
    items.forEach((it, i) => {
      const c = chips[i];
      const x = safe.x + (safe.w - c.w) / 2;
      drawChip(it, i, x, y, c);
      y += c.h + rowGap;
    });
    return;
  }

  let x = safe.x + (safe.w - totalW) / 2;
  const maxH = Math.max(...chips.map((c) => c.h));
  const y = safe.y + (safe.h - maxH) / 2;

  items.forEach((it, i) => {
    const c = chips[i];
    drawChip(it, i, x, y, c);
    x += c.w + gap;
    if (i < items.length - 1) {
      drawArrow(x, y + c.h / 2, i);
      x += arrow;
    }
  });
}

function layoutStat(ctx, layout, { safe, theme, type, sceneId, sceneLocalT, lang = 'en', motion, els, sceneTimeline }) {
  const at = sceneTimeline?.lead ?? 0;
  const valueFont = fontCss('700', type.title * 1.45, lang);
  const unitFont = fontCss('600', type.subtitle, lang);
  const capFont = fontCss('500', type.body, lang);
  const maxW = safe.w * 0.86;
  const displayValue = formatCountUpMotion(sceneLocalT, at, layout.value, motion);
  const value = measureBlock(ctx, displayValue || String(layout.value), { font: valueFont, maxWidth: maxW });
  const unit = layout.unit
    ? measureBlock(ctx, layout.unit, { font: unitFont, maxWidth: maxW })
    : null;
  const caption = layout.caption
    ? measureBlock(ctx, layout.caption, { font: capFont, maxWidth: maxW })
    : null;
  const hero = layout.clipart ? Math.min(safe.h * 0.38, safe.w * 0.3) : 0;
  const gap = type.body * 0.45;
  const totalH =
    (hero ? hero + gap : 0) +
    value.height +
    (unit ? gap * 0.6 + unit.height : 0) +
    (caption ? gap + caption.height : 0);
  let y = safe.y + (safe.h - totalH) / 2;

  withSoftIn(ctx, sceneLocalT, at, motion, () => {
    let cy = y;
    if (layout.clipart) {
      drawClipart(ctx, layout.clipart, safe.x + safe.w / 2, cy + hero / 2, hero, {
        accent: theme.accent,
        ink: theme.ink,
      });
      box(els, 'clipart', `scenes.json/${sceneId}/clipart`, safe.x + safe.w / 2 - hero / 2, cy, hero, hero);
      cy += hero + gap;
    }

    drawLines(ctx, value.lines, safe.x + safe.w / 2, cy, {
      font: valueFont,
      color: theme.accent,
      align: 'center',
    });
    box(
      els,
      'title',
      `scenes.json/${sceneId}/value`,
      safe.x + (safe.w - value.width) / 2,
      cy,
      value.width,
      value.height,
      { fontSize: type.title * 1.45 },
    );
    cy += value.height;
    if (unit) {
      cy += gap * 0.6;
      drawLines(ctx, unit.lines, safe.x + safe.w / 2, cy, {
        font: unitFont,
        color: theme.ink,
        align: 'center',
      });
      box(
        els,
        'subtitle',
        `scenes.json/${sceneId}/unit`,
        safe.x + (safe.w - unit.width) / 2,
        cy,
        unit.width,
        unit.height,
        { fontSize: type.subtitle },
      );
      cy += unit.height;
    }
    if (caption) {
      cy += gap;
      drawLines(ctx, caption.lines, safe.x + safe.w / 2, cy, {
        font: capFont,
        color: theme.muted,
        align: 'center',
      });
      box(
        els,
        'text',
        `scenes.json/${sceneId}/caption`,
        safe.x + (safe.w - caption.width) / 2,
        cy,
        caption.width,
        caption.height,
        { fontSize: type.body },
      );
    }
  });
}

function layoutChart(ctx, layout, { safe, theme, type, sceneId, sceneLocalT, cues, lang = 'en', motion, els }) {
  const titleFont = fontCss('700', type.subtitle, lang);
  const labelFont = fontCss('500', type.label, lang);
  const series = layout.series || [];
  const pad = type.body * 0.5;
  const titleH = layout.title
    ? measureBlock(ctx, layout.title, { font: titleFont, maxWidth: safe.w * 0.9 }).height + pad
    : 0;

  const chartX = safe.x + pad;
  const chartY = safe.y + titleH + pad;
  const chartW = safe.w - pad * 2;
  const chartH = safe.h - titleH - pad * 2;

  if (layout.title) {
    const t = measureBlock(ctx, layout.title, { font: titleFont, maxWidth: safe.w * 0.9 });
    drawLines(ctx, t.lines, safe.x + safe.w / 2, safe.y, {
      font: titleFont,
      color: theme.ink,
      align: 'center',
    });
    box(els, 'title', `scenes.json/${sceneId}/title`, safe.x + (safe.w - t.width) / 2, safe.y, t.width, t.height, {
      fontSize: type.subtitle,
    });
  }

  ctx.fillStyle = theme.card;
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 2;
  roundRect(ctx, chartX, chartY, chartW, chartH, 16);
  ctx.fill();
  ctx.stroke();
  box(els, 'card', `scenes.json/${sceneId}/chart`, chartX, chartY, chartW, chartH);

  const innerPad = type.body * 0.7;
  const plotX = chartX + innerPad;
  const plotY = chartY + innerPad;
  const plotW = chartW - innerPad * 2;
  const plotH = chartH - innerPad * 2 - type.label * 1.8;

  const maxV = Math.max(...series.map((s) => s.value), 1e-6);
  const hi = layout.highlight;

  if (layout.kind === 'pie') {
    drawPie(ctx, {
      series,
      cx: plotX + plotW / 2,
      cy: plotY + plotH / 2,
      r: Math.min(plotW, plotH) * 0.38,
      theme,
      type,
      sceneId,
      sceneLocalT,
      cues,
      motion,
      layout,
      els,
      labelFont,
      hi,
    });
    return;
  }

  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const gy = plotY + plotH * (g / 4);
    ctx.beginPath();
    ctx.moveTo(plotX, gy);
    ctx.lineTo(plotX + plotW, gy);
    ctx.stroke();
  }

  if (layout.kind === 'bar') {
    const barGap = plotW * 0.06;
    const barW = (plotW - barGap * (series.length + 1)) / series.length;
    series.forEach((pt, i) => {
      const at = itemAt(i, cues, motion);
      const grow = drawOnMotion(sceneLocalT, at, motion);
      if (grow <= 0) return;
      const fullH = (pt.value / maxV) * plotH;
      const h = Math.max(4, fullH * grow);
      const x = plotX + barGap + i * (barW + barGap);
      const y = plotY + plotH - h;
      const { alpha } = softInMotion(sceneLocalT, at, { ...motion, slidePx: 0 });
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = i === hi ? theme.accent : `${theme.accent}99`;
      roundRect(ctx, x, y, barW, h, 6);
      ctx.fill();
      box(els, 'bar', `scenes.json/${sceneId}/series/${i}`, x, y, barW, h, { alpha });
      const lab = measureBlock(ctx, pt.label, { font: labelFont, maxWidth: barW + barGap });
      drawLines(ctx, lab.lines, x + barW / 2, plotY + plotH + type.label * 0.35, {
        font: labelFont,
        color: theme.muted,
        align: 'center',
      });
      box(
        els,
        'text',
        `scenes.json/${sceneId}/series/${i}/label`,
        x + barW / 2 - lab.width / 2,
        plotY + plotH + type.label * 0.35,
        lab.width,
        lab.height,
        { fontSize: type.label, alpha },
      );
      ctx.restore();
    });
    return;
  }

  // line — grow segment by segment
  const pts = series.map((pt, i) => {
    const x = plotX + (series.length === 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
    const y = plotY + plotH - (pt.value / maxV) * plotH;
    return { x, y, pt, i };
  });
  ctx.save();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  let started = false;
  pts.forEach(({ x, y, pt, i }) => {
    const p = drawOnMotion(sceneLocalT, itemAt(i, cues, motion), motion);
    if (p <= 0) return;
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  if (started) ctx.stroke();
  pts.forEach(({ x, y, pt, i }) => {
    const at = itemAt(i, cues, motion);
    const { alpha } = softInMotion(sceneLocalT, at, { ...motion, slidePx: 0 });
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = i === hi ? theme.accent : theme.ink;
    ctx.beginPath();
    ctx.arc(x, y, i === hi ? 8 : 6, 0, Math.PI * 2);
    ctx.fill();
    box(els, 'point', `scenes.json/${sceneId}/series/${i}`, x - 8, y - 8, 16, 16, { alpha });
    const lab = measureBlock(ctx, pt.label, { font: labelFont, maxWidth: plotW / series.length });
    drawLines(ctx, lab.lines, x, plotY + plotH + type.label * 0.35, {
      font: labelFont,
      color: theme.muted,
      align: 'center',
    });
    box(
      els,
      'text',
      `scenes.json/${sceneId}/series/${i}/label`,
      x - lab.width / 2,
      plotY + plotH + type.label * 0.35,
      lab.width,
      lab.height,
      { fontSize: type.label, alpha },
    );
  });
  ctx.restore();
}

function drawPie(ctx, {
  series,
  cx,
  cy,
  r,
  theme,
  type,
  sceneId,
  sceneLocalT,
  cues,
  motion,
  layout,
  els,
  labelFont,
  hi,
}) {
  const total = series.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  let angle = -Math.PI / 2;
  const colors = [theme.accent, `${theme.accent}bb`, `${theme.accent}77`, theme.muted, theme.border, theme.ink];

  series.forEach((pt, i) => {
    const at = itemAt(i, cues, motion);
    const grow = drawOnMotion(sceneLocalT, at, motion);
    const sweep = (Math.max(0, pt.value) / total) * Math.PI * 2 * grow;
    const { alpha } = softInMotion(sceneLocalT, at, { ...motion, slidePx: 0 });
    if (alpha > 0 && sweep > 0) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + sweep);
      ctx.closePath();
      ctx.fillStyle = i === hi ? theme.accent : colors[i % colors.length];
      ctx.fill();
      ctx.strokeStyle = theme.card;
      ctx.lineWidth = 3;
      ctx.stroke();
      const mid = angle + sweep / 2;
      const lx = cx + Math.cos(mid) * (r * 0.55);
      const ly = cy + Math.sin(mid) * (r * 0.55);
      box(els, 'slice', `scenes.json/${sceneId}/series/${i}`, lx - 10, ly - 10, 20, 20, { alpha });
      ctx.restore();
    }
    angle += (Math.max(0, pt.value) / total) * Math.PI * 2;
  });

  const legendY = cy + r + type.label * 1.2;
  let lx = cx - (series.length * type.label * 4) / 2;
  series.forEach((pt, i) => {
    const at = itemAt(i, cues, motion);
    const { alpha } = softInMotion(sceneLocalT, at, { ...motion, slidePx: 0 });
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = i === hi ? theme.accent : colors[i % colors.length];
    ctx.fillRect(lx, legendY, type.label * 0.7, type.label * 0.7);
    const lab = measureBlock(ctx, pt.label, { font: labelFont, maxWidth: type.label * 5 });
    drawLines(ctx, lab.lines, lx + type.label, legendY, {
      font: labelFont,
      color: theme.muted,
    });
    box(els, 'text', `scenes.json/${sceneId}/series/${i}/label`, lx, legendY, type.label + lab.width, lab.height, {
      fontSize: type.label,
      alpha,
    });
    ctx.restore();
    lx += type.label * 5.5;
  });
}

/** Horizontal timeline of labeled beats (a2e time-axis relation). */
function layoutTimeline(ctx, layout, { safe, theme, type, sceneId, sceneLocalT, cues, lang = 'en', motion, els }) {
  const items = layout.items || [];
  const labelFont = fontCss('700', type.label, lang);
  const pad = type.body * 0.45;
  const n = Math.max(1, items.length);
  const trackY = safe.y + safe.h * 0.42;
  const x0 = safe.x + pad * 2;
  const x1 = safe.x + safe.w - pad * 2;
  const span = x1 - x0;

  // Dense timelines: vertical rail keeps long Autogenerate labels inside the safe area.
  if (n >= 5) {
    let bodyPx = type.body;
    let rowGap = bodyPx * 0.55;
    let bodyFont = fontCss('500', bodyPx, lang);
    let rows = [];
    const measureRows = () => {
      rows = items.map((it) => measureBlock(ctx, it.text, { font: bodyFont, maxWidth: safe.w * 0.78 }));
    };
    measureRows();
    for (let guard = 0; guard < 8; guard++) {
      const totalH = rows.reduce((s, r) => s + r.height + bodyPx * 1.05, 0) + rowGap * Math.max(0, n - 1);
      if (totalH <= safe.h) break;
      bodyPx = Math.max(type.minReadable || 18, bodyPx * 0.9);
      rowGap = bodyPx * 0.45;
      bodyFont = fontCss('500', bodyPx, lang);
      measureRows();
    }
    const totalH = rows.reduce((s, r) => s + r.height + bodyPx * 1.05, 0) + rowGap * Math.max(0, n - 1);
    let y = safe.y + Math.max(0, (safe.h - totalH) / 2);
    const railX = safe.x + bodyPx * 0.9;
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(railX, y);
    ctx.lineTo(railX, y + Math.max(bodyPx, totalH - bodyPx * 0.4));
    ctx.stroke();
    items.forEach((it, i) => {
      const at = itemAt(i, cues, motion);
      const m = rows[i];
      const rowH = m.height + bodyPx * 1.05;
      withSoftIn(ctx, sceneLocalT, at, motion, (alpha) => {
        ctx.fillStyle = theme.accent;
        ctx.beginPath();
        ctx.arc(railX, y + bodyPx * 0.55, 8, 0, Math.PI * 2);
        ctx.fill();
        box(els, 'point', `scenes.json/${sceneId}/items/${i}`, railX - 8, y + bodyPx * 0.55 - 8, 16, 16, {
          alpha,
        });
        const tx = railX + bodyPx * 1.2;
        drawLines(ctx, m.lines, tx, y + bodyPx * 0.15, {
          font: bodyFont,
          color: theme.ink,
          align: 'left',
        });
        box(els, 'text', `scenes.json/${sceneId}/items/${i}/text`, tx, y + bodyPx * 0.15, m.width, m.height, {
          fontSize: bodyPx,
          alpha,
        });
      });
      y += rowH + rowGap;
    });
    return;
  }

  const bodyFont = fontCss('500', type.body, lang);
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0, trackY);
  ctx.lineTo(x1, trackY);
  ctx.stroke();
  box(els, 'card', `scenes.json/${sceneId}/track`, x0, trackY - 2, span, 4);

  items.forEach((it, i) => {
    const at = itemAt(i, cues, motion);
    const t = n === 1 ? 0.5 : i / (n - 1);
    const cx = x0 + span * t;
    const grow = drawOnMotion(sceneLocalT, at, motion);
    if (grow <= 0) return;
    withSoftIn(ctx, sceneLocalT, at, motion, (alpha) => {
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(cx, trackY, 10 * Math.max(0.35, grow), 0, Math.PI * 2);
      ctx.fill();
      box(els, 'point', `scenes.json/${sceneId}/items/${i}`, cx - 10, trackY - 10, 20, 20, { alpha });

      const above = i % 2 === 0;
      const maxW = Math.min(safe.w * 0.28, span / Math.max(2, n - 1) + pad * 4);
      const m = measureBlock(ctx, it.text, { font: bodyFont, maxWidth: maxW });
      let ty = above ? trackY - type.body * 1.8 - m.height : trackY + type.body * 1.2;
      ty = Math.max(safe.y, Math.min(ty, safe.y + safe.h - m.height));
      let textX = cx;
      let align = 'center';
      let boxX = cx - m.width / 2;
      if (boxX < safe.x) {
        boxX = safe.x;
        textX = safe.x;
        align = 'left';
      } else if (boxX + m.width > safe.x + safe.w) {
        boxX = safe.x + safe.w - m.width;
        textX = safe.x + safe.w;
        align = 'right';
      }
      drawLines(ctx, m.lines, textX, ty, {
        font: bodyFont,
        color: theme.ink,
        align,
      });
      box(els, 'text', `scenes.json/${sceneId}/items/${i}/text`, boxX, ty, m.width, m.height, {
        fontSize: type.body,
        alpha,
      });
      ctx.strokeStyle = theme.muted;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, trackY + (above ? -12 : 12));
      ctx.lineTo(cx, above ? Math.min(trackY - 12, ty + m.height + 4) : Math.max(trackY + 12, ty - 4));
      ctx.stroke();
      const idx = measureBlock(ctx, String(i + 1), { font: labelFont, maxWidth: 40 });
      drawLines(ctx, idx.lines, cx, trackY - idx.height / 2, {
        font: labelFont,
        color: theme.card,
        align: 'center',
      });
    });
  });
}

/** Narrowing stages (a2e Trap / filter). Top = wide intake, bottom = kept set. */
function layoutFunnel(ctx, layout, { safe, theme, type, sceneId, sceneLocalT, cues, lang = 'en', motion, els }) {
  const items = layout.items || [];
  const bodyFont = fontCss('600', type.body, lang);
  const n = Math.max(2, items.length);
  const gap = type.body * 0.35;
  const maxW = safe.w * 0.72;
  const minW = safe.w * 0.28;
  const stageH = Math.min(type.body * 2.4, (safe.h * 0.7 - gap * (n - 1)) / n);
  const totalH = n * stageH + gap * (n - 1);
  let y = safe.y + Math.max(0, (safe.h - totalH) / 2);
  const cx = safe.x + safe.w / 2;

  items.forEach((it, i) => {
    const at = itemAt(i, cues, motion);
    const t = n === 1 ? 0 : i / (n - 1);
    const w = maxW - (maxW - minW) * t;
    const x = cx - w / 2;
    const grow = drawOnMotion(sceneLocalT, at, motion);
    if (grow <= 0) {
      y += stageH + gap;
      return;
    }
    const drawW = Math.max(minW * 0.5, w * Math.max(0.25, grow));
    const drawX = cx - drawW / 2;
    withSoftIn(ctx, sceneLocalT, at, motion, (alpha) => {
      const isLast = i === n - 1;
      ctx.fillStyle = isLast ? theme.accent : theme.card;
      ctx.strokeStyle = isLast ? theme.accent : theme.border;
      ctx.lineWidth = 2;
      roundRect(ctx, drawX, y, drawW, stageH, 12);
      ctx.fill();
      ctx.stroke();
      box(els, 'card', `scenes.json/${sceneId}/items/${i}`, drawX, y, drawW, stageH, { alpha });

      if (it.clipart || it.icon) {
        const g = Math.min(stageH * 0.7, type.body * 1.6);
        drawGlyph(ctx, it, drawX + g * 0.7, y + stageH / 2, g, theme);
      }
      const m = measureBlock(ctx, it.text, {
        font: bodyFont,
        maxWidth: drawW - type.body * 1.4,
      });
      drawLines(ctx, m.lines, cx, y + (stageH - m.height) / 2, {
        font: bodyFont,
        color: isLast ? theme.card : theme.ink,
        align: 'center',
      });
      box(els, 'text', `scenes.json/${sceneId}/items/${i}/text`, cx - m.width / 2, y + (stageH - m.height) / 2, m.width, m.height, {
        fontSize: type.body,
        alpha,
      });
    });
    y += stageH + gap;
  });
}

/** Single emphasized line + optional attribution (a2e source / takeaway). */
function layoutQuote(ctx, layout, { safe, theme, type, sceneId, sceneLocalT, lang = 'en', motion, els, sceneTimeline }) {
  const at = sceneTimeline?.lead ?? 0;
  const quoteFont = fontCss('700', type.title * 0.92, lang);
  const attribFont = fontCss('500', type.body, lang);
  const maxW = safe.w * 0.78;
  const quote = measureBlock(ctx, layout.text, { font: quoteFont, maxWidth: maxW });
  const attrib = layout.attrib
    ? measureBlock(ctx, layout.attrib, { font: attribFont, maxWidth: maxW })
    : null;
  const hero = layout.clipart ? Math.min(safe.h * 0.22, safe.w * 0.18) : 0;
  const gap = type.body * 0.55;
  const totalH =
    (hero ? hero + gap : 0) + quote.height + (attrib ? gap * 0.7 + attrib.height : 0) + type.body * 0.8;
  let y = safe.y + (safe.h - totalH) / 2;

  withSoftIn(ctx, sceneLocalT, at, motion, () => {
    let cy = y;
    if (layout.clipart) {
      drawClipart(ctx, layout.clipart, safe.x + safe.w / 2, cy + hero / 2, hero, {
        accent: theme.accent,
        ink: theme.ink,
      });
      box(els, 'clipart', `scenes.json/${sceneId}/clipart`, safe.x + safe.w / 2 - hero / 2, cy, hero, hero);
      cy += hero + gap;
    }
    // Accent bar
    ctx.fillStyle = theme.accent;
    const barH = Math.max(quote.height, type.title * 0.9);
    roundRect(ctx, safe.x + safe.w * 0.08, cy, 6, barH, 3);
    ctx.fill();

    const qx = safe.x + safe.w * 0.08 + type.body;
    drawLines(ctx, quote.lines, qx, cy, {
      font: quoteFont,
      color: theme.ink,
    });
    box(els, 'title', `scenes.json/${sceneId}/text`, qx, cy, quote.width, quote.height, {
      fontSize: type.title * 0.92,
    });
    cy += quote.height;
    if (attrib) {
      cy += gap * 0.7;
      drawLines(ctx, attrib.lines, qx, cy, {
        font: attribFont,
        color: theme.muted,
      });
      box(els, 'subtitle', `scenes.json/${sceneId}/attrib`, qx, cy, attrib.width, attrib.height, {
        fontSize: type.body,
      });
    }
  });
}
