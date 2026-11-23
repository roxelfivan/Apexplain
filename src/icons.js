/**
 * Lucide icon subset as SVG path strings (24×24 viewBox).
 * Loaded from lucide-static at runtime so we don't ship a build step.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Path2D } from '@napi-rs/canvas';
import { ROOT } from './paths.js';

const require = createRequire(import.meta.url);

export const ICON_NAMES = [
  'globe',
  'calendar',
  'clock',
  'lightbulb',
  'list',
  'check',
  'arrow-right',
  'arrow-left',
  'star',
  'heart',
  'zap',
  'book',
  'code',
  'cpu',
  'database',
  'file',
  'folder',
  'home',
  'image',
  'link',
  'mail',
  'map',
  'message-circle',
  'play',
  'search',
  'settings',
  'shield',
  'user',
  'users',
  'video',
  'triangle-alert',
  'x',
  'plus',
  'minus',
  'info',
  'sparkles',
  'rocket',
  'target',
  'layers',
  'git-branch',
];

const n = (v) => Number(v ?? 0);
const r3 = (v) => Math.round(v * 1000) / 1000;

function ellipsePath(cx, cy, rx, ry) {
  return `M${r3(cx - rx)} ${r3(cy)}a${r3(rx)} ${r3(ry)} 0 1 0 ${r3(2 * rx)} 0a${r3(rx)} ${r3(ry)} 0 1 0 ${r3(-2 * rx)} 0`;
}

function rectPath(x, y, w, h, rx, ry) {
  if (!rx && !ry) return `M${x} ${y}h${w}v${h}h${-w}Z`;
  rx = Math.min(rx || ry, w / 2);
  ry = Math.min(ry || rx, h / 2);
  return `M${r3(x + rx)} ${y}h${r3(w - 2 * rx)}a${rx} ${ry} 0 0 1 ${rx} ${ry}v${r3(h - 2 * ry)}a${rx} ${ry} 0 0 1 ${-rx} ${ry}h${r3(-(w - 2 * rx))}a${rx} ${ry} 0 0 1 ${-rx} ${-ry}v${r3(-(h - 2 * ry))}a${rx} ${ry} 0 0 1 ${rx} ${-ry}Z`;
}

function pointsPath(points, close) {
  const p = String(points).trim().split(/[\s,]+/).map(Number);
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
  return close ? d + 'Z' : d;
}

function toPath([tag, a]) {
  switch (tag) {
    case 'path':
      return a.d;
    case 'circle':
      return ellipsePath(n(a.cx), n(a.cy), n(a.r), n(a.r));
    case 'ellipse':
      return ellipsePath(n(a.cx), n(a.cy), n(a.rx), n(a.ry));
    case 'rect':
      return rectPath(n(a.x), n(a.y), n(a.width), n(a.height), n(a.rx), n(a.ry));
    case 'line':
      return `M${n(a.x1)} ${n(a.y1)}L${n(a.x2)} ${n(a.y2)}`;
    case 'polyline':
      return pointsPath(a.points, false);
    case 'polygon':
      return pointsPath(a.points, true);
    default:
      return null;
  }
}

let cache = null;

function loadNodes() {
  if (cache) return cache;
  let pkg;
  try {
    pkg = path.dirname(require.resolve('lucide-static/package.json', { paths: [ROOT] }));
  } catch {
    pkg = path.join(ROOT, 'node_modules', 'lucide-static');
  }
  const nodes = JSON.parse(fs.readFileSync(path.join(pkg, 'icon-nodes.json'), 'utf8'));
  cache = {};
  for (const name of ICON_NAMES) {
    const list = nodes[name];
    if (!list) continue;
    cache[name] = list.map(toPath).filter(Boolean);
  }
  // Aliases used in starter / docs examples.
  if (cache['triangle-alert'] && !cache.warning) cache.warning = cache['triangle-alert'];
  return cache;
}

export function hasIcon(name) {
  if (!name) return false;
  const icons = loadNodes();
  return !!icons[name] || !!icons[String(name).replace(/_/g, '-')];
}

export function iconPaths(name) {
  const icons = loadNodes();
  const key = icons[name] ? name : String(name || '').replace(/_/g, '-');
  return icons[key] || icons.help || icons.info || [];
}

/**
 * Draw a Lucide icon centered at (cx, cy).
 */
export function drawIcon(ctx, name, cx, cy, size, color) {
  const paths = iconPaths(name);
  if (!paths.length) return;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const d of paths) {
    const p = new Path2D(d);
    ctx.stroke(p);
  }
  ctx.restore();
}
