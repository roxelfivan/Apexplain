/**
 * Named line-art clipart for scenes.json (canvas-drawn, not Lucide).
 * Design space is 100×100; drawClipart scales to `size`.
 */

export const CLIPART_NAMES = [
  'doc',
  'db',
  'server',
  'funnel',
  'nodes',
  'stack',
  'magnifier',
  'shield-block',
  'book',
  'cloud',
  'gear',
  'globe-wire',
  'phone',
  'person',
  'cycle',
  'bars',
];

/** Common LLM / Lucide mix-ups → real clipart keys. */
export const CLIPART_ALIASES = {
  map: 'globe-wire',
  globe: 'globe-wire',
  earth: 'globe-wire',
  world: 'globe-wire',
  database: 'db',
  cylinder: 'db',
  document: 'doc',
  file: 'doc',
  folder: 'stack',
  search: 'magnifier',
  shield: 'shield-block',
  user: 'person',
  users: 'person',
  people: 'person',
  mobile: 'phone',
  laptop: 'server',
  computer: 'server',
  chart: 'bars',
  graph: 'bars',
  network: 'nodes',
  filter: 'funnel',
  refresh: 'cycle',
  sync: 'cycle',
  settings: 'gear',
  cog: 'gear',
};

const NAME_SET = new Set(CLIPART_NAMES);

export function resolveClipartName(name) {
  if (!name) return null;
  const raw = String(name).replace(/_/g, '-');
  if (NAME_SET.has(raw)) return raw;
  const aliased = CLIPART_ALIASES[raw];
  return aliased && NAME_SET.has(aliased) ? aliased : null;
}

export function hasClipart(name) {
  return !!resolveClipartName(name);
}

function strokeFill(ctx, { fill = null, stroke = null, lineWidth = 3 } = {}) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
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

/** Drawers receive ctx already scaled so 0–100 is the glyph box. */
const DRAW = {
  doc(ctx, accent, ink) {
    roundRectPath(ctx, 22, 12, 56, 76, 6);
    strokeFill(ctx, { fill: `${accent}22`, stroke: ink, lineWidth: 3 });
    ctx.beginPath();
    ctx.moveTo(56, 12);
    ctx.lineTo(78, 34);
    ctx.lineTo(56, 34);
    ctx.closePath();
    strokeFill(ctx, { fill: `${accent}33`, stroke: ink, lineWidth: 2.5 });
    for (const y of [48, 58, 68]) {
      ctx.beginPath();
      ctx.moveTo(34, y);
      ctx.lineTo(70, y);
      strokeFill(ctx, { stroke: accent, lineWidth: 2.5 });
    }
  },

  db(ctx, accent, ink) {
    const drawEll = (cy) => {
      ctx.beginPath();
      ctx.ellipse(50, cy, 28, 10, 0, 0, Math.PI * 2);
    };
    ctx.beginPath();
    ctx.moveTo(22, 28);
    ctx.lineTo(22, 72);
    ctx.ellipse(50, 72, 28, 10, 0, Math.PI, 0, true);
    ctx.lineTo(78, 28);
    ctx.ellipse(50, 28, 28, 10, 0, 0, Math.PI, true);
    ctx.closePath();
    strokeFill(ctx, { fill: `${accent}22`, stroke: ink, lineWidth: 3 });
    drawEll(28);
    strokeFill(ctx, { stroke: ink, lineWidth: 2.5 });
    drawEll(50);
    strokeFill(ctx, { stroke: accent, lineWidth: 2.5 });
    drawEll(72);
    strokeFill(ctx, { stroke: ink, lineWidth: 2.5 });
  },

  server(ctx, accent, ink) {
    for (const [y, h] of [
      [14, 22],
      [40, 22],
      [66, 22],
    ]) {
      roundRectPath(ctx, 18, y, 64, h, 5);
      strokeFill(ctx, { fill: `${accent}18`, stroke: ink, lineWidth: 2.5 });
      ctx.beginPath();
      ctx.arc(30, y + h / 2, 3.5, 0, Math.PI * 2);
      strokeFill(ctx, { fill: accent, stroke: null });
      ctx.beginPath();
      ctx.moveTo(42, y + h / 2);
      ctx.lineTo(72, y + h / 2);
      strokeFill(ctx, { stroke: accent, lineWidth: 2.5 });
    }
  },

  funnel(ctx, accent, ink) {
    ctx.beginPath();
    ctx.moveTo(18, 18);
    ctx.lineTo(82, 18);
    ctx.lineTo(58, 48);
    ctx.lineTo(58, 82);
    ctx.lineTo(42, 82);
    ctx.lineTo(42, 48);
    ctx.closePath();
    strokeFill(ctx, { fill: `${accent}22`, stroke: ink, lineWidth: 3 });
    ctx.beginPath();
    ctx.moveTo(28, 30);
    ctx.lineTo(72, 30);
    strokeFill(ctx, { stroke: accent, lineWidth: 2.5 });
  },

  nodes(ctx, accent, ink) {
    const pts = [
      [28, 28],
      [72, 28],
      [50, 72],
      [50, 48],
    ];
    ctx.beginPath();
    ctx.moveTo(28, 28);
    ctx.lineTo(72, 28);
    ctx.lineTo(50, 72);
    ctx.closePath();
    strokeFill(ctx, { stroke: ink, lineWidth: 2.5 });
    ctx.beginPath();
    ctx.moveTo(50, 48);
    ctx.lineTo(50, 72);
    strokeFill(ctx, { stroke: accent, lineWidth: 2.5 });
    for (const [x, y] of pts) {
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      strokeFill(ctx, { fill: `${accent}33`, stroke: ink, lineWidth: 2.5 });
    }
  },

  stack(ctx, accent, ink) {
    const layers = [
      [20, 22, 60, 16],
      [26, 42, 48, 16],
      [32, 62, 36, 16],
    ];
    layers.forEach(([x, y, w, h], i) => {
      roundRectPath(ctx, x, y, w, h, 4);
      strokeFill(ctx, {
        fill: i === 1 ? `${accent}33` : `${accent}15`,
        stroke: ink,
        lineWidth: 2.5,
      });
    });
  },

  magnifier(ctx, accent, ink) {
    ctx.beginPath();
    ctx.arc(42, 42, 24, 0, Math.PI * 2);
    strokeFill(ctx, { fill: `${accent}18`, stroke: ink, lineWidth: 3 });
    ctx.beginPath();
    ctx.moveTo(60, 60);
    ctx.lineTo(82, 82);
    strokeFill(ctx, { stroke: accent, lineWidth: 6 });
  },

  'shield-block'(ctx, accent, ink) {
    ctx.beginPath();
    ctx.moveTo(50, 12);
    ctx.lineTo(82, 26);
    ctx.lineTo(78, 58);
    ctx.quadraticCurveTo(50, 88, 50, 88);
    ctx.quadraticCurveTo(50, 88, 22, 58);
    ctx.lineTo(18, 26);
    ctx.closePath();
    strokeFill(ctx, { fill: `${accent}22`, stroke: ink, lineWidth: 3 });
    ctx.beginPath();
    ctx.moveTo(36, 50);
    ctx.lineTo(46, 60);
    ctx.lineTo(66, 38);
    strokeFill(ctx, { stroke: accent, lineWidth: 4 });
  },

  book(ctx, accent, ink) {
    roundRectPath(ctx, 24, 16, 52, 68, 4);
    strokeFill(ctx, { fill: `${accent}18`, stroke: ink, lineWidth: 3 });
    ctx.beginPath();
    ctx.moveTo(50, 16);
    ctx.lineTo(50, 84);
    strokeFill(ctx, { stroke: accent, lineWidth: 3 });
    for (const y of [36, 48, 60]) {
      ctx.beginPath();
      ctx.moveTo(30, y);
      ctx.lineTo(44, y);
      strokeFill(ctx, { stroke: ink, lineWidth: 2 });
      ctx.beginPath();
      ctx.moveTo(56, y);
      ctx.lineTo(70, y);
      strokeFill(ctx, { stroke: ink, lineWidth: 2 });
    }
  },

  cloud(ctx, accent, ink) {
    ctx.beginPath();
    ctx.arc(38, 52, 18, 0, Math.PI * 2);
    ctx.arc(58, 46, 22, 0, Math.PI * 2);
    ctx.arc(74, 54, 14, 0, Math.PI * 2);
    roundRectPath(ctx, 22, 52, 64, 20, 0);
    strokeFill(ctx, { fill: `${accent}22`, stroke: ink, lineWidth: 3 });
  },

  gear(ctx, accent, ink) {
    const cx = 50;
    const cy = 50;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2 - Math.PI / 16;
      const a1 = a0 + Math.PI / 8;
      const a2 = a1 + Math.PI / 16;
      const op = i === 0 ? 'moveTo' : 'lineTo';
      ctx[op](cx + Math.cos(a0) * 28, cy + Math.sin(a0) * 28);
      ctx.lineTo(cx + Math.cos(a1) * 36, cy + Math.sin(a1) * 36);
      ctx.lineTo(cx + Math.cos(a2) * 28, cy + Math.sin(a2) * 28);
    }
    ctx.closePath();
    strokeFill(ctx, { fill: `${accent}22`, stroke: ink, lineWidth: 2.5 });
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    strokeFill(ctx, { fill: `${accent}08`, stroke: ink, lineWidth: 3 });
  },

  'globe-wire'(ctx, accent, ink) {
    ctx.beginPath();
    ctx.arc(50, 50, 32, 0, Math.PI * 2);
    strokeFill(ctx, { fill: `${accent}15`, stroke: ink, lineWidth: 3 });
    ctx.beginPath();
    ctx.ellipse(50, 50, 14, 32, 0, 0, Math.PI * 2);
    strokeFill(ctx, { stroke: accent, lineWidth: 2.5 });
    ctx.beginPath();
    ctx.moveTo(18, 50);
    ctx.lineTo(82, 50);
    strokeFill(ctx, { stroke: ink, lineWidth: 2.5 });
    ctx.beginPath();
    ctx.ellipse(50, 50, 32, 12, 0, 0, Math.PI * 2);
    strokeFill(ctx, { stroke: accent, lineWidth: 2 });
  },

  phone(ctx, accent, ink) {
    roundRectPath(ctx, 32, 10, 36, 80, 8);
    strokeFill(ctx, { fill: `${accent}18`, stroke: ink, lineWidth: 3 });
    roundRectPath(ctx, 38, 22, 24, 46, 3);
    strokeFill(ctx, { stroke: accent, lineWidth: 2 });
    ctx.beginPath();
    ctx.arc(50, 78, 3, 0, Math.PI * 2);
    strokeFill(ctx, { fill: ink, stroke: null });
  },

  person(ctx, accent, ink) {
    ctx.beginPath();
    ctx.arc(50, 30, 14, 0, Math.PI * 2);
    strokeFill(ctx, { fill: `${accent}22`, stroke: ink, lineWidth: 3 });
    ctx.beginPath();
    ctx.moveTo(22, 82);
    ctx.quadraticCurveTo(22, 52, 50, 52);
    ctx.quadraticCurveTo(78, 52, 78, 82);
    ctx.lineTo(22, 82);
    ctx.closePath();
    strokeFill(ctx, { fill: `${accent}18`, stroke: ink, lineWidth: 3 });
  },

  cycle(ctx, accent, ink) {
    ctx.beginPath();
    ctx.arc(50, 50, 28, Math.PI * 0.15, Math.PI * 1.55);
    strokeFill(ctx, { stroke: ink, lineWidth: 4 });
    ctx.beginPath();
    ctx.moveTo(68, 18);
    ctx.lineTo(78, 32);
    ctx.lineTo(58, 34);
    ctx.closePath();
    strokeFill(ctx, { fill: accent, stroke: ink, lineWidth: 2 });
    ctx.beginPath();
    ctx.arc(50, 50, 28, Math.PI * 1.15, Math.PI * 2.55);
    strokeFill(ctx, { stroke: accent, lineWidth: 4 });
  },

  bars(ctx, accent, ink) {
    const bars = [
      [22, 58, 16, 26],
      [42, 40, 16, 44],
      [62, 28, 16, 56],
    ];
    bars.forEach(([x, y, w, h], i) => {
      roundRectPath(ctx, x, y, w, h, 3);
      strokeFill(ctx, {
        fill: i === 2 ? `${accent}44` : `${accent}18`,
        stroke: ink,
        lineWidth: 2.5,
      });
    });
  },
};

/**
 * Draw named clipart centered at (cx, cy) with bounding box `size`.
 */
export function drawClipart(ctx, name, cx, cy, size, { accent, ink }) {
  const key = resolveClipartName(name);
  const draw = key ? DRAW[key] : null;
  if (!draw) return;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 100, size / 100);
  draw(ctx, accent, ink);
  ctx.restore();
}
