/** Built-in looks for Apexplain. */

export const THEMES = {
  studio: {
    id: 'studio',
    bg: '#f4f6f8',
    card: '#ffffff',
    ink: '#1a1d24',
    muted: '#5c6570',
    accent: '#2f6fed',
    border: '#d8dee6',
    shadow: 'rgba(26, 29, 36, 0.08)',
  },
  dark: {
    id: 'dark',
    bg: '#12141a',
    card: '#1c2028',
    ink: '#e8ebf0',
    muted: '#9aa3b2',
    accent: '#6b9fff',
    border: '#2a3140',
    shadow: 'rgba(0, 0, 0, 0.35)',
  },
};

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
