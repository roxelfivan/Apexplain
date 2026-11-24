/**
 * Lucide icon subset as SVG path strings (24×24 viewBox).
 * Loaded from lucide-static at runtime so we don't ship a build step.
 *
 * Keep this list wide enough for Autogenerate (travel, science, money, civic,
 * media, UI process) — unknown names still fail make unless aliased here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Path2D } from '@napi-rs/canvas';
import { ROOT } from './paths.js';

const require = createRequire(import.meta.url);

export const ICON_NAMES = [
  // core / UI
  'globe',
  'earth',
  'calendar',
  'calendar-days',
  'calendar-check',
  'calendar-x',
  'calendar-range',
  'calendar-clock',
  'clock',
  'timer',
  'hourglass',
  'alarm-clock',
  'history',
  'watch',
  'lightbulb',
  'list',
  'list-checks',
  'list-ordered',
  'check',
  'circle-check',
  'circle-x',
  'circle-alert',
  'circle-help',
  'badge-check',
  'ban',
  'arrow-right',
  'arrow-left',
  'arrow-up',
  'arrow-down',
  'arrow-up-right',
  'chevron-right',
  'chevron-left',
  'chevrons-right',
  'external-link',
  'star',
  'heart',
  'zap',
  'sparkles',
  'sparkle',
  'wand-sparkles',
  'book',
  'book-open',
  'library',
  'newspaper',
  'code',
  'binary',
  'terminal',
  'cpu',
  'bot',
  'database',
  'server',
  'network',
  'workflow',
  'file',
  'file-check',
  'folder',
  'clipboard-check',
  'copy',
  'save',
  'download',
  'upload',
  'share-2',
  'trash-2',
  'pencil',
  'pen-line',
  'highlighter',
  'house', // Lucide renamed home → house
  'image',
  'link',
  'mail',
  'map',
  'map-pin',
  'map-pinned',
  'message-circle',
  'megaphone',
  'bell',
  'play',
  'search',
  'settings',
  'sliders-horizontal',
  'filter',
  'refresh-cw',
  'rotate-cw',
  'repeat',
  'shield',
  'user',
  'users',
  'accessibility',
  'video',
  'triangle-alert',
  'x',
  'plus',
  'minus',
  'info',
  'circle',
  'square',
  'infinity',
  'rocket',
  'target',
  'layers',
  'blocks',
  'puzzle',
  'git-branch',
  // transport / travel / places
  'train-front',
  'train-track',
  'tram-front',
  'bus',
  'car',
  'truck',
  'ambulance',
  'plane',
  'ship',
  'sailboat',
  'anchor',
  'bike',
  'route',
  'navigation',
  'compass',
  'signpost',
  'waypoints',
  'milestone',
  'flag',
  'ticket',
  'luggage',
  'backpack',
  'hotel',
  'bed',
  'briefcase',
  'building',
  'building-2',
  'factory',
  'store',
  'landmark',
  'church',
  'castle',
  'tent',
  'mountain',
  'trees',
  'tree-pine',
  'waves',
  'sun',
  'moon',
  'cloud',
  'cloud-off',
  'cloud-sun',
  'cloud-rain',
  'umbrella',
  'snowflake',
  // food / hospitality
  'coffee',
  'utensils',
  'utensils-crossed',
  // money / commerce
  'wallet',
  'credit-card',
  'coins',
  'banknote',
  'circle-dollar-sign',
  'hand-coins',
  'piggy-bank',
  'tag',
  'tags',
  'percent',
  'receipt',
  'shopping-bag',
  'shopping-cart',
  'trending-up',
  'trending-down',
  'chart-bar',
  'chart-pie',
  'chart-line',
  'activity',
  // science / health / nature
  'flask-conical',
  'atom',
  'brain',
  'dna',
  'microscope',
  'stethoscope',
  'heart-pulse',
  'pill',
  'syringe',
  'leaf',
  'sprout',
  'paw-print',
  'cat',
  'dog',
  'fish',
  'bird',
  'eye',
  'hand',
  'footprints',
  // education / civic / media
  'school',
  'graduation-cap',
  'languages',
  'gavel',
  'scale',
  'vote',
  'phone',
  'music',
  'mic',
  'headphones',
  'volume-2',
  'camera',
  'tv',
  'smartphone',
  'tablet',
  'laptop',
  'wifi',
  'battery',
  'battery-charging',
  'plug',
];

/**
 * Friendly / legacy / model-emitted names → Lucide icon-nodes keys.
 */
export const ICON_ALIASES = {
  warning: 'triangle-alert',
  alert: 'triangle-alert',
  home: 'house',
  train: 'train-front',
  tram: 'tram-front',
  chart: 'chart-bar',
  graph: 'chart-bar',
  'bar-chart': 'chart-bar',
  'bar-chart-2': 'chart-bar',
  'bar-chart-3': 'chart-bar',
  'pie-chart': 'chart-pie',
  'line-chart': 'chart-line',
  // travel / itinerary
  path: 'route',
  itinerary: 'route',
  directions: 'navigation',
  navigate: 'navigation',
  waypoint: 'waypoints',
  pin: 'map-pin',
  location: 'map-pin',
  place: 'map-pinned',
  world: 'globe',
  ferry: 'ship',
  boat: 'ship',
  bridge: 'landmark',
  restaurant: 'utensils',
  food: 'utensils',
  dining: 'utensils-crossed',
  cafe: 'coffee',
  drink: 'coffee',
  lodging: 'hotel',
  sleep: 'bed',
  rain: 'cloud-rain',
  weather: 'cloud-sun',
  nature: 'trees',
  hike: 'mountain',
  hiking: 'footprints',
  walk: 'footprints',
  // process / UI
  refresh: 'refresh-cw',
  reload: 'refresh-cw',
  sync: 'refresh-cw',
  rotate: 'rotate-cw',
  checklist: 'list-checks',
  todo: 'list-checks',
  done: 'circle-check',
  success: 'circle-check',
  error: 'circle-x',
  help: 'circle-help',
  question: 'circle-help',
  delete: 'trash-2',
  trash: 'trash-2',
  edit: 'pencil',
  write: 'pen-line',
  share: 'share-2',
  linkout: 'external-link',
  // money
  money: 'coins',
  cash: 'banknote',
  dollar: 'circle-dollar-sign',
  price: 'tag',
  cart: 'shopping-cart',
  shop: 'store',
  // creatures / health
  paw: 'paw-print',
  animal: 'paw-print',
  health: 'heart-pulse',
  medical: 'stethoscope',
  medicine: 'pill',
  vaccine: 'syringe',
  lab: 'flask-conical',
  science: 'atom',
  // media / devices
  mobile: 'smartphone',
  cellphone: 'smartphone',
  computer: 'laptop',
  pc: 'laptop',
  sound: 'volume-2',
  volume: 'volume-2',
  audio: 'headphones',
  film: 'video',
  photo: 'camera',
  // civic / school
  court: 'gavel',
  justice: 'scale',
  balance: 'scale',
  university: 'graduation-cap',
  college: 'graduation-cap',
  education: 'school',
  language: 'languages',
  translate: 'languages',
};

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
    if (!list) {
      // Keep going so one rename does not blank the whole set; aliases may still cover it.
      continue;
    }
    cache[name] = list.map(toPath).filter(Boolean);
  }
  for (const [alias, target] of Object.entries(ICON_ALIASES)) {
    if (cache[target] && !cache[alias]) cache[alias] = cache[target];
  }
  return cache;
}

export function resolveIconName(name) {
  if (!name) return null;
  const raw = String(name).replace(/_/g, '-').trim().toLowerCase();
  if (!raw) return null;
  return ICON_ALIASES[raw] || raw;
}

export function hasIcon(name) {
  if (!name) return false;
  const icons = loadNodes();
  const key = resolveIconName(name);
  return !!icons[key] || !!icons[String(name).replace(/_/g, '-')];
}

/**
 * Coerce a model-emitted icon to an allowlisted name, or null if unknown.
 */
export function coerceIconName(name) {
  if (name == null || name === '') return null;
  const key = resolveIconName(name);
  if (hasIcon(key)) return key;
  return null;
}

export function iconPaths(name) {
  const icons = loadNodes();
  const key = resolveIconName(name);
  if (icons[key]) return icons[key];
  const raw = String(name || '').replace(/_/g, '-');
  return icons[raw] || icons.help || icons.info || [];
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
