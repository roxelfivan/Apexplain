/**
 * ffmpeg helpers — prefer system binary, fall back to ffmpeg-static.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ApexError } from './errors.js';

const require = createRequire(import.meta.url);

export function ffmpegPath() {
  if (process.env.APEXPLAIN_FFMPEG) return process.env.APEXPLAIN_FFMPEG;
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], {
    encoding: 'utf8',
  });
  if (which.status === 0) {
    const p = (which.stdout || '').trim().split(/\r?\n/)[0];
    if (p) return p;
  }
  try {
    const staticPath = require('ffmpeg-static');
    if (staticPath) return staticPath;
  } catch {
    /* no static */
  }
  throw new ApexError('ffmpeg not found', {
    code: 'missing_ffmpeg',
    rule: 'ffmpeg',
    hint: 'Install ffmpeg (brew install ffmpeg) or keep the ffmpeg-static npm dependency.',
  });
}

export function ffmpegVersion() {
  try {
    const bin = ffmpegPath();
    const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
    if (r.status !== 0) return null;
    return { path: bin, line: (r.stdout || '').split('\n')[0] };
  } catch {
    return null;
  }
}

export function runFfmpeg(args, { input } = {}) {
  const bin = ffmpegPath();
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ['-hide_banner', '-y', ...args], {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let err = '';
    p.stderr.on('data', (d) => {
      err += d;
    });
    p.on('error', (e) =>
      reject(
        new ApexError(`ffmpeg could not start: ${e.message}`, {
          code: 'ffmpeg',
          rule: 'spawn',
        }),
      ),
    );
    p.on('close', (code) => {
      if (code === 0) resolve({ stderr: err });
      else {
        reject(
          new ApexError(`ffmpeg failed (${code}): ${err.split('\n').slice(-8).join('\n')}`, {
            code: 'ffmpeg',
            rule: 'exit',
          }),
        );
      }
    });
    if (input) p.stdin.end(input);
    else p.stdin.end();
  });
}

/** JPEG frame pipe → H.264 MP4 (no audio). */
export function frameEncoder({ fps, out, draft = false }) {
  const bin = ffmpegPath();
  const args = [
    '-hide_banner',
    '-y',
    '-loglevel',
    'error',
    '-f',
    'image2pipe',
    '-framerate',
    String(fps),
    '-c:v',
    'mjpeg',
    '-i',
    '-',
    '-c:v',
    'libx264',
    '-preset',
    draft ? 'veryfast' : 'medium',
    '-crf',
    draft ? '24' : '18',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
    '-movflags',
    '+faststart',
    out,
  ];
  const p = spawn(bin, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => {
    err += d;
  });
  const done = new Promise((resolve, reject) => {
    p.on('error', (e) => reject(new Error(`ffmpeg encoder: ${e.message}`)));
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg encoder failed (${code}): ${err.slice(-600)}`)),
    );
  });
  done.catch(() => {});
  return {
    write(buf) {
      if (p.stdin.write(buf)) return Promise.resolve();
      return new Promise((r) => p.stdin.once('drain', r));
    },
    async close() {
      p.stdin.end();
      await done;
    },
    kill() {
      try {
        p.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    },
  };
}
