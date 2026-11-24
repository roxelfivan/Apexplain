/** Built-in looks for Apexplain. */

export const THEMES = {
  studio: {
    id: 'studio',
    bg: '#f4f6f8',
    bgBottom: '#e8eef6',
    card: '#ffffff',
    ink: '#1a1d24',
    muted: '#5c6570',
    accent: '#2f6fed',
    border: '#d8dee6',
    shadow: 'rgba(26, 29, 36, 0.08)',
    wash: 'rgba(47, 111, 237, 0.06)',
  },
  dark: {
    id: 'dark',
    bg: '#12141a',
    bgBottom: '#0c0e14',
    card: '#1c2028',
    ink: '#e8ebf0',
    muted: '#9aa3b2',
    accent: '#6b9fff',
    border: '#2a3140',
    shadow: 'rgba(0, 0, 0, 0.35)',
    wash: 'rgba(107, 159, 255, 0.08)',
    dot: 'rgba(207, 224, 255, 0.22)',
  },
};

/** Deterministic 0–1 from integer seed. */
function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Soft atmosphere behind layouts: gradient wash + (dark) sparse dots.
 * Keeps apexplain themes; does not clone black/purple MG look.
 */
export function drawBackdrop(ctx, width, height, theme) {
  const top = theme.bg;
  const bottom = theme.bgBottom || theme.bg;
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  if (theme.wash) {
    const cx = width * 0.72;
    const cy = height * 0.22;
    const r = Math.max(width, height) * 0.55;
    const radial = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    radial.addColorStop(0, theme.wash);
    radial.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, width, height);
  }

  if (theme.id === 'dark' && theme.dot) {
    const step = Math.max(36, Math.round(Math.min(width, height) / 22));
    ctx.fillStyle = theme.dot;
    let i = 0;
    for (let y = step * 0.5; y < height; y += step) {
      for (let x = step * 0.5; x < width; x += step) {
        i += 1;
        const j = hash01(i * 17 + 3);
        if (j < 0.35) continue;
        const r = 1.1 + hash01(i * 9) * 1.4;
        const ox = (hash01(i * 5) - 0.5) * step * 0.35;
        const oy = (hash01(i * 13) - 0.5) * step * 0.35;
        ctx.globalAlpha = 0.25 + hash01(i * 11) * 0.45;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

export function getTheme(name) {
  return THEMES[name] || THEMES.studio;
}

/** Type scale relative to the short frame edge. */
export function typeScale(minSide) {
  const u = minSide / 100;
  return {
    title: Math.round(u * 7.2),
    subtitle: Math.round(u * 3.6),
    body: Math.round(u * 3.2),
    label: Math.round(u * 2.6),
    minReadable: Math.max(18, Math.round(u * 2.2)),
  };
}

export function frameSize(size) {
  if (size === '9:16') return { width: 1080, height: 1920 };
  return { width: 1920, height: 1080 };
}

export function safeArea(width, height) {
  const m = Math.round(Math.min(width, height) * 0.07);
  return { x: m, y: m, w: width - m * 2, h: height - m * 2, margin: m };
}
