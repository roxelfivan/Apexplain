import fs from 'node:fs';
import path from 'node:path';
import { packageVersion, ROOT } from './paths.js';
import { cacheRoot, ttsDtype } from './models.js';
import { ffmpegVersion } from './ffmpeg.js';

function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  const minor = Number(process.versions.node.split('.')[1]);
  const ok = major > 20 || (major === 20 && minor >= 11);
  return {
    name: 'node',
    ok,
    detail: `v${process.versions.node}`,
    ...(ok ? {} : { fix: 'Install Node.js 20.11 or newer.' }),
  };
}

function checkKokoro() {
  const kokoro = path.join(ROOT, 'node_modules', 'kokoro-js', 'package.json');
  const transformers = path.join(ROOT, 'node_modules', '@huggingface', 'transformers', 'package.json');
  if (fs.existsSync(kokoro) && fs.existsSync(transformers)) {
    return {
      name: 'kokoro',
      ok: true,
      detail: `installed (dtype=${ttsDtype()}, cache=${cacheRoot()})`,
    };
  }
  return {
    name: 'kokoro',
    ok: false,
    detail: 'missing',
    fix: 'Run npm install in the apexplain repo.',
  };
}

function checkFfmpeg() {
  const info = ffmpegVersion();
  if (!info) {
    return {
      name: 'ffmpeg',
      ok: false,
      detail: 'missing',
      fix: 'Install ffmpeg or keep the ffmpeg-static dependency.',
    };
  }
  return { name: 'ffmpeg', ok: true, detail: `${info.line} (${info.path})` };
}

/**
 * Report local toolchain readiness for Apexplain.
 */
export function doctor() {
  const checks = [checkNode(), checkKokoro(), checkFfmpeg()];
  const ok = checks.every((c) => c.ok);
  const lines = [
    `apexplain ${packageVersion()}`,
    ...checks.map((c) => `${c.ok ? 'ok' : 'missing'}  ${c.name}: ${c.detail}${c.fix ? ` — ${c.fix}` : ''}`),
  ];
  return {
    ok,
    version: packageVersion(),
    checks,
    message: lines.join('\n'),
  };
}
