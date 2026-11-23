import fs from 'node:fs';
import path from 'node:path';
import { packageVersion, ROOT } from './paths.js';
import { probeKokoro } from './models.js';
import { ffmpegVersion } from './ffmpeg.js';
import { probeVocello } from './tts/vocello.js';
import { resolveTextFont } from './fonts.js';

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
  const probe = probeKokoro();
  if (probe.ok) {
    return { name: 'kokoro', ok: true, detail: probe.detail };
  }
  const pkg = path.join(ROOT, 'node_modules', 'kokoro-js', 'package.json');
  if (!fs.existsSync(pkg)) {
    return {
      name: 'kokoro',
      ok: false,
      detail: probe.detail,
      fix: 'Run npm install in the apexplain repo.',
    };
  }
  return {
    name: 'kokoro',
    ok: false,
    detail: probe.detail,
    fix: probe.fix || 'npm run setup:kokoro',
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

function checkVocello({ required }) {
  const probe = probeVocello();
  if (probe.ok) {
    return { name: 'vocello', ok: true, detail: probe.detail, required: !!required };
  }
  return {
    name: 'vocello',
    ok: !required,
    detail: required ? probe.detail : `${probe.detail} (optional unless lang=zh-HK)`,
    required: !!required,
    ...(required ? { fix: probe.fix || 'npm run setup:vocello' } : {}),
  };
}

function checkCjkFont({ required }) {
  try {
    const font = resolveTextFont(required ? 'zh-HK' : 'en');
    if (!required) {
      return { name: 'cjk-font', ok: true, detail: 'not required for English', required: false };
    }
    return {
      name: 'cjk-font',
      ok: true,
      detail: font.path ? `${font.family} @ ${font.path}` : font.family,
      required: true,
    };
  } catch (e) {
    return {
      name: 'cjk-font',
      ok: !required,
      detail: required ? e.message : 'optional unless lang=zh-HK',
      required: !!required,
      ...(required ? { fix: e.hint || 'Install Noto Sans TC or set APEXPLAIN_FONT' } : {}),
    };
  }
}

function checkLocalPolicy() {
  const allowHf = process.env.APEXPLAIN_ALLOW_HF === '1';
  const allowNet = process.env.APEXPLAIN_ALLOW_NET === '1';
  const offline = process.env.APEXPLAIN_OFFLINE === '1';
  const parts = [];
  parts.push(allowHf ? 'HF download ON' : 'HF local-only');
  parts.push(allowNet ? 'Wikipedia ON' : 'autogenerate local stub');
  if (offline) parts.push('APEXPLAIN_OFFLINE=1');
  return {
    name: 'local',
    ok: true,
    detail: parts.join(' · '),
  };
}

/**
 * Report local toolchain readiness for Apexplain.
 * @param {{ lang?: string }} [opts]
 */
export function doctor(opts = {}) {
  const lang = opts.lang || 'en';
  const needZh = lang === 'zh-HK';
  const checks = [
    checkNode(),
    checkLocalPolicy(),
    checkKokoro(),
    checkFfmpeg(),
    checkVocello({ required: needZh }),
    checkCjkFont({ required: needZh }),
  ];
  const ok = checks.every((c) => c.ok);
  const lines = [
    `apexplain ${packageVersion()}` + (needZh ? ' (checking zh-HK)' : ''),
    ...checks.map(
      (c) => `${c.ok ? 'ok' : 'missing'}  ${c.name}: ${c.detail}${c.fix ? ` — ${c.fix}` : ''}`,
    ),
  ];
  return {
    ok,
    version: packageVersion(),
    lang,
    checks,
    message: lines.join('\n'),
  };
}
