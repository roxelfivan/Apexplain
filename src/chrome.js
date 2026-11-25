/**
 * Phase 3 — lightweight chrome.
 *
 * Optional bottom chapter/progress strip drawn *below* the safe area so scene
 * content and burned-in captions stay clear. Chrome is opt-in:
 *   video.json → { "progress": true, "chapters": ["Intro", "Orbit"] }
 *
 * Chapter labels come from `video.chapters`, else from storyboard.md `##` headings.
 */
import { fontCss } from './fonts.js';

/** Scene-id style slug (matches generate.js slugSceneId base rules). */
export function slugChapterId(label) {
  const base = String(label || 'part')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 24);
  return base || 'part';
}

/** Ordered `{ label, id }` pairs from storyboard.md `##` headings. */
export function storyboardChapters(storyboard) {
  const text = String(storyboard || '');
  if (!text.trim()) return [];
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s{0,3}##\s+(.+?)\s*$/);
    if (!m) continue;
    const label = m[1].trim();
    if (!label) continue;
    out.push({ label, id: slugChapterId(label) });
  }
  return out;
}

function chunkScenes(count, total) {
  // Even split: first `count` buckets get the extra scenes.
  const groups = [];
  if (count <= 0 || total <= 0) return groups;
  const base = Math.floor(total / count);
  const extra = total % count;
  let idx = 0;
  for (let g = 0; g < count; g++) {
    const size = base + (g < extra ? 1 : 0);
    groups.push({ from: idx, to: idx + Math.max(1, size) - 1 });
    idx += size;
  }
  return groups;
}

/**
 * Resolve chapter bands for a timeline.
 * @returns {{ enabled: boolean, items: Array<{ label: string|null, start: number, end: number, from: number, to: number }> }}
 */
export function resolveChapters({ video, timeline, storyboard = '' } = {}) {
  const scenes = timeline?.scenes || [];
  const enabled = Boolean(video?.progress) && scenes.length > 0;
  if (!enabled) return { enabled: false, items: [] };

  const explicit = Array.isArray(video?.chapters)
    ? video.chapters
        .map((c) => (typeof c === 'string' ? c : c?.label || c?.title || ''))
        .map((s) => String(s).trim())
        .filter(Boolean)
    : [];

  let groups = [];
  if (explicit.length) {
    groups = chunkScenes(explicit.length, scenes.length).map((g, i) => ({
      label: explicit[i],
      from: g.from,
      to: g.to,
    }));
  } else {
    // Storyboard headings become chapter starts when they match scene ids.
    const board = storyboardChapters(storyboard);
    if (board.length) {
      const used = new Set();
      scenes.forEach((sc, index) => {
        const hit = board.find((b) => !used.has(b.id) && b.id === sc.id);
        if (!hit) return;
        used.add(hit.id);
        groups.push({ label: hit.label, from: index, to: index });
      });
      if (groups.length) {
        // Merge scenes before the first chapter start into it.
        if (groups[0].from > 0) {
          groups[0].from = 0;
          groups[0].to = Math.max(groups[0].to, 0);
        }
        // Extend each chapter to the scene before the next chapter start.
        for (let i = 0; i < groups.length; i++) {
          const next = groups[i + 1];
          groups[i].to = next ? next.from - 1 : scenes.length - 1;
        }
      } else {
        // Headings do not line up with scene ids — spread them over the scenes in order.
        groups = chunkScenes(board.length, scenes.length).map((g, i) => ({
          label: board[i].label,
          from: g.from,
          to: g.to,
        }));
      }
    }
  }

  const items = groups.map((g) => {
    const first = scenes[g.from];
    const last = scenes[Math.min(g.to, scenes.length - 1)];
    return {
      label: g.label || null,
      from: g.from,
      to: g.to,
      start: first?.start ?? 0,
      end: (last?.start ?? 0) + (last?.dur ?? 0),
    };
  });

  return { enabled: true, items, duration: timeline?.duration || 0 };
}

/** Geometry for the bottom strip (lives below the safe area). */
export function chromeGeometry({ width, height, safe, type }) {
  const barH = Math.max(4, Math.round(type.label * 0.16));
  const labelH = Math.round(type.label * 1.15);
  const gap = Math.round(type.label * 0.5);
  const margin = Math.round(safe.margin * 0.4);
  const bottom = height - margin;
  const barY = bottom - barH;
  const labelY = barY - gap - labelH;
  return {
    barH,
    labelH,
    gap,
    margin,
    bottom,
    barY,
    labelY,
    x: safe.x,
    w: safe.w,
    /** Space the strip occupies at the bottom of the frame. */
    inset: height - (labelY - gap * 0.5),
  };
}

/** Chapter index for a time position. */
export function chapterAt(chapters, t) {
  const items = chapters?.items || [];
  for (let i = items.length - 1; i >= 0; i--) {
    if (t + 1e-6 >= items[i].start) return i;
  }
  return 0;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Draw the bottom progress strip with chapter ticks and the current chapter label.
 * @returns {object[]} drawn elements (for layout QA)
 */
export function drawProgressChrome(
  ctx,
  { chapters, progress = 0, chapterIndex = 0, width, height, theme, safe, type, lang = 'en' } = {},
) {
  if (!chapters?.enabled) return [];
  const g = chromeGeometry({ width, height, safe, type });
  const els = [];

  // Soft fade so the strip reads as chrome, not content.
  const fade = ctx.createLinearGradient(0, g.labelY - g.gap, 0, height);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, theme?.id === 'dark' ? 'rgba(0,0,0,0.45)' : 'rgba(26,29,36,0.10)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, g.labelY - g.gap, width, height - (g.labelY - g.gap));

  // Track
  ctx.fillStyle = theme?.border || 'rgba(0,0,0,0.15)';
  roundRectPath(ctx, g.x, g.barY, g.w, g.barH, g.barH / 2);
  ctx.fill();

  // Filled progress
  const p = Math.max(0, Math.min(1, Number(progress) || 0));
  if (p > 0.001) {
    ctx.fillStyle = theme?.accent || '#2f6fed';
    roundRectPath(ctx, g.x, g.barY, Math.max(g.barH, g.w * p), g.barH, g.barH / 2);
    ctx.fill();
  }

  // Chapter ticks
  const items = chapters.items || [];
  items.forEach((c, i) => {
    if (i === 0) return;
    const x = g.x + g.w * (c.start / Math.max(0.001, chapters.duration || 1));
    ctx.fillStyle = theme?.bg || '#ffffff';
    ctx.fillRect(Math.round(x) - 1, g.barY - 2, 2, g.barH + 4);
  });

  // Current chapter label
  const current = items[chapterIndex];
  if (current?.label) {
    const fontSize = Math.round(type.label * 0.95);
    ctx.save();
    ctx.font = fontCss('600', fontSize, lang);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const text =
      items.length > 1 ? `${current.label}  ·  ${chapterIndex + 1}/${items.length}` : current.label;
    ctx.fillStyle = theme?.muted || '#5c6570';
    ctx.fillText(text, g.x, g.labelY + g.labelH * 0.8);
    els.push({
      kind: 'text',
      path: 'video.json/chapters',
      x: g.x,
      y: g.labelY,
      x1: g.x + ctx.measureText(text).width,
      y1: g.labelY + g.labelH,
      w: ctx.measureText(text).width,
      h: g.labelH,
      fontSize,
    });
    ctx.restore();
  }

  els.push({
    kind: 'chrome',
    path: 'video.json/progress',
    x: g.x,
    y: g.barY,
    x1: g.x + g.w,
    y1: g.barY + g.barH,
    w: g.w,
    h: g.barH,
  });

  return els;
}