import fs from 'node:fs';
import path from 'node:path';
import { ApexError } from './errors.js';
import { LANGS } from './project.js';
import { templateDirForLang, projectPaths } from './paths.js';

const SIZES = new Set(['16:9', '9:16']);
const THEMES = new Set(['studio', 'dark']);

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] ?? `{{${key}}}`));
}

/**
 * Create a new Apexplain project directory from the starter template.
 * @param {string} dir
 * @param {{ title?: string, size?: string, theme?: string, lang?: string, targetSeconds?: number }} opts
 */
export function initProject(dir, opts = {}) {
  const title = opts.title?.trim() || path.basename(path.resolve(dir)).replace(/[-_]/g, ' ') || 'Untitled';
  const size = opts.size || '16:9';
  const theme = opts.theme || 'studio';
  const lang = opts.lang || 'en';
  let targetSeconds = 60;
  if (opts.targetSeconds !== undefined && opts.targetSeconds !== null && opts.targetSeconds !== '') {
    const n = Number(opts.targetSeconds);
    if (!Number.isFinite(n) || n < 15 || n > 600) {
      throw new ApexError(`targetSeconds must be a number from 15 to 600`, {
        code: 'bad_flag',
        path: '--target-seconds',
        rule: 'range',
        hint: 'Pick a rough finished length in seconds (e.g. 45, 60, 90).',
      });
    }
    targetSeconds = Math.round(n);
  }

  if (!SIZES.has(size)) {
    throw new ApexError(`size must be 16:9 or 9:16, not "${size}"`, {
      code: 'bad_flag',
      path: '--size',
      rule: 'enum',
    });
  }
  if (!THEMES.has(theme)) {
    throw new ApexError(`theme must be studio or dark, not "${theme}"`, {
      code: 'bad_flag',
      path: '--theme',
      rule: 'enum',
    });
  }
  if (!LANGS.has(lang)) {
    throw new ApexError(`lang must be en or zh-HK, not "${lang}"`, {
      code: 'bad_flag',
      path: '--lang',
      rule: 'enum',
    });
  }

  const paths = projectPaths(dir);
  if (fs.existsSync(paths.root) && fs.readdirSync(paths.root).length > 0) {
    throw new ApexError(`directory is not empty: ${paths.root}`, {
      code: 'dir_not_empty',
      path: paths.root,
      rule: 'empty_dir',
      hint: 'Pick a new folder, or remove its contents first.',
    });
  }

  const templateDir = templateDirForLang(lang);
  if (!fs.existsSync(templateDir)) {
    throw new ApexError(`missing template for lang ${lang}`, {
      code: 'missing_template',
      path: templateDir,
      rule: 'exists',
    });
  }

  fs.mkdirSync(paths.root, { recursive: true });
  const vars = { title, size, theme, lang, targetSeconds: String(targetSeconds) };

  for (const name of ['video.json', 'script.md', 'scenes.json', 'storyboard.md']) {
    const srcPath = path.join(templateDir, name);
    if (!fs.existsSync(srcPath)) continue;
    const src = fs.readFileSync(srcPath, 'utf8');
    let out = fill(src, vars);
    if (name === 'video.json') {
      // Coerce targetSeconds to a number in the written JSON (template keeps it
      // quoted so a missed fill never produces invalid JSON).
      const parsed = JSON.parse(out);
      parsed.targetSeconds = targetSeconds;
      out = JSON.stringify(parsed, null, 2) + '\n';
    }
    fs.writeFileSync(path.join(paths.root, name), out);
  }

  return {
    ok: true,
    dir: paths.root,
    files: ['video.json', 'script.md', 'scenes.json', 'storyboard.md'].filter((n) =>
      fs.existsSync(path.join(paths.root, n)),
    ),
    title,
    size,
    theme,
    lang,
    targetSeconds,
    message: `created ${displayPath(paths.root)} (${lang}, ${size}, ${theme}, ~${targetSeconds}s)`,
  };
}

function displayPath(abs) {
  const rel = path.relative(process.cwd(), abs);
  if (!rel) return '.';
  if (rel.startsWith('..') || path.isAbsolute(rel)) return abs;
  return rel;
}
