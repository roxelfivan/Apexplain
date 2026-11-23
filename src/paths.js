import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const TEMPLATES = path.join(ROOT, 'templates', 'starter');
export const DOCS_DIR = path.join(ROOT, 'docs');

export function packageVersion() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
}

export function projectPaths(dir) {
  const root = path.resolve(dir);
  return {
    root,
    video: path.join(root, 'video.json'),
    script: path.join(root, 'script.md'),
    scenes: path.join(root, 'scenes.json'),
    build: path.join(root, 'build'),
    out: path.join(root, 'out'),
    outVideo: path.join(root, 'out', 'video.mp4'),
  };
}
