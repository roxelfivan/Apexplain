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
 * @param {{ title?: string, size?: string, theme?: string, lang?: string }} opts
 */
export function initProject(dir, opts = {}) {
  const title = opts.title?.trim() || path.basename(path.resolve(dir)).replace(/[-_]/g, ' ') || 'Untitled';
  const size = opts.size || '16:9';
  const theme = opts.theme || 'studio';
  const lang = opts.lang || 'en';

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
  const vars = { title, size, theme, lang };

  for (const name of ['video.json', 'script.md', 'scenes.json']) {
    const src = fs.readFileSync(path.join(templateDir, name), 'utf8');
    fs.writeFileSync(path.join(paths.root, name), fill(src, vars));
  }

  return {
    ok: true,
    dir: paths.root,
    files: ['video.json', 'script.md', 'scenes.json'],
    title,
    size,
    theme,
    lang,
    message: `created ${displayPath(paths.root)} (${lang}, ${size}, ${theme})`,
  };
}

function displayPath(abs) {
  const rel = path.relative(process.cwd(), abs);
  if (!rel) return '.';
  if (rel.startsWith('..') || path.isAbsolute(rel)) return abs;
  return rel;
}
