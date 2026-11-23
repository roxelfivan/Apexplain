import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { makeFull } from '../src/make.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'bin', 'apexplain.js');
const example = path.join(root, 'examples', 'leap-years');

function run(args, env = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, APEXPLAIN_TTS: 'mock', ...env },
  });
}

describe('full make (phase 6)', () => {
  it('writes an MP4 for a short project', async () => {
    process.env.APEXPLAIN_TTS = 'mock';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apexplain-full-'));
    const dir = path.join(tmp, 'demo');
    const init = run(['init', dir, '--title', 'Short']);
    assert.equal(init.status, 0, init.stderr);

    // Keep the render tiny for CI.
    const videoPath = path.join(dir, 'video.json');
    const video = JSON.parse(fs.readFileSync(videoPath, 'utf8'));
    video.fps = 10;
    fs.writeFileSync(videoPath, JSON.stringify(video, null, 2));

    const result = await makeFull(dir, {
      draft: true,
      log: () => {},
    });
    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(result.out));
    assert.ok(fs.statSync(result.out).size > 1000);
    assert.ok(fs.existsSync(result.srt));
  });

  it('CLI make examples/leap-years --draft writes out/video.mp4', () => {
    // Clean previous outputs for a clear assert.
    fs.rmSync(path.join(example, 'out'), { recursive: true, force: true });
    fs.rmSync(path.join(example, 'build', 'voice'), { recursive: true, force: true });

    const r = run(['make', example, '--draft'], { APEXPLAIN_TTS: 'mock' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const mp4 = path.join(example, 'out', 'video.mp4');
    assert.ok(fs.existsSync(mp4), 'missing out/video.mp4');
    assert.ok(fs.statSync(mp4).size > 5000);
    assert.match(r.stdout, /ok: wrote MP4/);
  });

  it('invalid scenes still fail with path+rule', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apexplain-bad-'));
    const dir = path.join(tmp, 'demo');
    assert.equal(run(['init', dir, '--title', 'Bad']).status, 0);
    const scenesPath = path.join(dir, 'scenes.json');
    const scenes = JSON.parse(fs.readFileSync(scenesPath, 'utf8'));
    scenes.main.layout = 'nope';
    fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2));
    const r = run(['make', dir, '--dry-run', '--json']);
    assert.notEqual(r.status, 0);
    const body = JSON.parse(r.stdout);
    assert.equal(body.error.path, 'scenes.json/main/layout');
    assert.equal(body.error.rule, 'enum');
  });
});
