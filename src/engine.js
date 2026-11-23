/**
 * Canvas frame renderer + geometric layout check.
 */
import { createCanvas } from '@napi-rs/canvas';
import { ApexError } from './errors.js';
import { hasIcon } from './icons.js';
import { renderLayout } from './layouts.js';
import { frameSize, getTheme, safeArea, typeScale } from './theme.js';

export function createFrameContext(video) {
  const { width, height } = frameSize(video.size);
  const theme = getTheme(video.theme);
  const safe = safeArea(width, height);
  const type = typeScale(Math.min(width, height));
  return { width, height, theme, safe, type };
}

function assertIcons(sceneId, layout) {
  const iconFields = [];
  if (layout.icon) iconFields.push({ name: layout.icon, path: `scenes.json/${sceneId}/icon` });
  for (const [i, it] of (layout.items || []).entries()) {
    if (it.icon) iconFields.push({ name: it.icon, path: `scenes.json/${sceneId}/items/${i}/icon` });
  }
  if (layout.left?.icon) iconFields.push({ name: layout.left.icon, path: `scenes.json/${sceneId}/left/icon` });
  if (layout.right?.icon) iconFields.push({ name: layout.right.icon, path: `scenes.json/${sceneId}/right/icon` });
  for (const f of iconFields) {
    if (!hasIcon(f.name)) {
      throw new ApexError(`unknown icon "${f.name}"`, {
        code: 'bad_icon',
        path: f.path,
        rule: 'icon',
        hint: 'Use a Lucide name from the Apexplain subset (globe, calendar, check, …).',
      });
    }
  }
}

/**
 * Draw one scene frame onto a canvas (reused across video frames).
 */
export function drawSceneFrame(ctx, { video, sceneId, layout, sceneTimeline = null, t = Infinity, width, height, theme, safe, type }) {
  if (!layout) {
    throw new ApexError(`no layout for scene "${sceneId}"`, {
      code: 'missing_layout',
      path: `scenes.json/${sceneId}`,
      rule: 'required',
    });
  }
  assertIcons(sceneId, layout);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);
  const els = [];
  renderLayout(ctx, layout, {
    safe,
    theme,
    type,
    sceneId,
    sceneLocalT: t,
    sceneTimeline,
    lang: video?.lang || 'en',
    els,
  });
  return els;
}

/**
 * Render one frame for a scene at local time t (seconds into the scene).
 * @returns {{ png: Buffer, els: object[], width: number, height: number }}
 */
export function renderSceneFrame({ video, sceneId, layout, sceneTimeline = null, t = Infinity }) {
  const { width, height, theme, safe, type } = createFrameContext(video);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const els = drawSceneFrame(ctx, {
    video,
    sceneId,
    layout,
    sceneTimeline,
    t,
    width,
    height,
    theme,
    safe,
    type,
  });
  return {
    png: canvas.toBuffer('image/png'),
    els,
    width,
    height,
    safe,
    type,
  };
}

function intersects(a, b) {
  return a.x < b.x1 && a.x1 > b.x && a.y < b.y1 && a.y1 > b.y;
}

function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y, b.y));
  return x * y;
}

/**
 * Geometric QA. Throws ApexError on first hard failure.
 */
export function checkLayout(els, { safe, type, sceneId }) {
  const visible = els.filter((e) => (e.alpha ?? 1) > 0.05);

  for (const e of visible) {
    if (e.fontSize != null && e.fontSize < type.minReadable) {
      throw new ApexError(
        `text too small (${e.fontSize}px < ${type.minReadable}px min)`,
        {
          code: 'layout',
          path: e.path,
          rule: 'min_type_size',
          hint: 'Shorten the copy or use fewer items so type can stay large.',
        },
      );
    }
  }

  for (const e of visible) {
    const pad = 1;
    if (e.x < safe.x - pad || e.y < safe.y - pad || e.x1 > safe.x + safe.w + pad || e.y1 > safe.y + safe.h + pad) {
      throw new ApexError(`element overflows the safe area`, {
        code: 'layout',
        path: e.path,
        rule: 'overflow',
        hint: 'Shorten text or reduce items so everything fits inside the margins.',
      });
    }
  }

  const textish = visible.filter((e) => e.kind === 'text' || e.kind === 'title' || e.kind === 'subtitle');
  for (let i = 0; i < textish.length; i++) {
    for (let j = i + 1; j < textish.length; j++) {
      const a = textish[i];
      const b = textish[j];
      if (!intersects(a, b)) continue;
      const area = overlapArea(a, b);
      const minArea = Math.min(a.w * a.h, b.w * b.h);
      if (area > minArea * 0.25) {
        throw new ApexError(`text overlaps another element`, {
          code: 'layout',
          path: a.path,
          rule: 'overlap',
          hint: `Conflicts with ${b.path}. Shorten labels or split into another scene.`,
        });
      }
    }
  }

  return { ok: true, sceneId, elements: visible.length };
}

/**
 * Render + check every scene at full reveal (end of scene / Infinity).
 */
export function checkProjectLayouts(project, timeline = null) {
  const { video, script, scenes } = project;
  const reports = [];
  for (const sc of script.scenes) {
    const sceneTimeline = timeline?.scenes?.find((s) => s.id === sc.id) || null;
    const t = sceneTimeline ? sceneTimeline.dur : Infinity;
    const frame = renderSceneFrame({
      video,
      sceneId: sc.id,
      layout: scenes[sc.id],
      sceneTimeline,
      t,
    });
    const report = checkLayout(frame.els, {
      safe: frame.safe,
      type: frame.type,
      sceneId: sc.id,
    });
    reports.push(report);
  }
  return reports;
}
