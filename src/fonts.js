/**
 * Resolve a Traditional Chinese–capable font for canvas rendering.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GlobalFonts } from '@napi-rs/canvas';
import { ApexError } from './errors.js';

const CANDIDATES = [
  // macOS
  '/System/Library/Fonts/PingFang.ttc',
  '/System/Library/Fonts/Supplemental/Songti.ttc',
  '/Library/Fonts/Arial Unicode.ttf',
  // Linux
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansTC-Regular.otf',
  '/usr/share/fonts/truetype/noto-cjk/NotoSansCJK-Regular.ttc',
  // Windows
  'C:\\Windows\\Fonts\\msjh.ttc',
  'C:\\Windows\\Fonts\\mingliu.ttc',
];

const FAMILY_ALIASES = [
  'PingFang HK',
  'PingFang TC',
  'Hiragino Sans CNS',
  'Noto Sans TC',
  'Noto Sans CJK TC',
  'Microsoft JhengHei',
  'Songti TC',
  'Arial Unicode MS',
];

let cached = null;

function homeFontDirs() {
  const home = os.homedir();
  return [
    path.join(home, 'Library', 'Fonts'),
    path.join(home, '.fonts'),
    path.join(home, '.local', 'share', 'fonts'),
  ];
}

function findOnDisk() {
  if (process.env.APEXPLAIN_FONT && fs.existsSync(process.env.APEXPLAIN_FONT)) {
    return process.env.APEXPLAIN_FONT;
  }
  for (const p of CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  for (const dir of homeFontDirs()) {
    if (!fs.existsSync(dir)) continue;
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (/noto.*tc|pingfang|msjh|mingliu|cjk.*tc/i.test(name) && /\.(ttc|ttf|otf)$/i.test(name)) {
        return path.join(dir, name);
      }
    }
  }
  return null;
}

/**
 * @returns {{ family: string, path?: string }}
 */
export function resolveTextFont(lang = 'en') {
  if (lang !== 'zh-HK') {
    return { family: 'sans-serif' };
  }
  if (cached) return cached;

  for (const family of FAMILY_ALIASES) {
    try {
      if (GlobalFonts.has(family)) {
        cached = { family };
        return cached;
      }
    } catch {
      /* ignore */
    }
  }

  const file = findOnDisk();
  if (file) {
    const family = 'ApexplainCJK';
    try {
      GlobalFonts.registerFromPath(file, family);
      cached = { family, path: file };
      return cached;
    } catch (e) {
      throw new ApexError(`could not load Chinese font at ${file}: ${e.message}`, {
        code: 'bad_font',
        path: 'fonts',
        rule: 'cjk_font',
        hint: 'Set APEXPLAIN_FONT to a Noto Sans TC / PingFang HK font file.',
      });
    }
  }

  throw new ApexError('no Traditional Chinese font found', {
    code: 'missing_font',
    path: 'fonts',
    rule: 'cjk_font',
    hint: 'Install Noto Sans TC, or set APEXPLAIN_FONT to a .ttf/.otf/.ttc path.',
  });
}

export function fontCss(weight, size, lang = 'en') {
  const { family } = resolveTextFont(lang);
  if (family === 'sans-serif') return `${weight} ${size}px sans-serif`;
  return `${weight} ${size}px "${family}", "Noto Sans TC", sans-serif`;
}
