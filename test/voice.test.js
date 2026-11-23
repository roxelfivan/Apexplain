import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it, before } from 'node:test';
import { makeVoiceOnly } from '../src/make.js';
import { loadProject } from '../src/project.js';
import { readWav } from '../src/wav.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'bin', 'apexplain.js');

function run(args, env = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, APEXPLAIN_TTS: 'mock', ...env },
  });
}

describe('voice-only (mock TTS)', () => {
  let dir;

  before(() => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apexplain-voice-'));
    dir = path.join(tmp, 'demo');
    const init = run(['init', dir, '--title', 'Voice demo']);
    assert.equal(init.status, 0, init.stderr);
  });

  it('writes WAVs and measured timeline; second run is cache hit', async () => {
    process.env.APEXPLAIN_TTS = 'mock';
    const logs = [];
    const first = await makeVoiceOnly(dir, {
      log: (m) => logs.push(m),
    });
    assert.equal(first.ok, true);
    assert.equal(first.timeline.kind, 'measured');
    assert.ok(fs.existsSync(path.join(dir, 'build', 'voice', 'intro.wav')));
    assert.ok(fs.existsSync(path.join(dir, 'build', 'timeline.json')));

    const wav = readWav(path.join(dir, 'build', 'voice', 'intro.wav'));
    assert.ok(wav.duration > 0.1);

    const tl = JSON.parse(fs.readFileSync(path.join(dir, 'build', 'timeline.json'), 'utf8'));
    assert.equal(tl.kind, 'measured');
    assert.ok(tl.scenes.every((s) => s.voiceDur >= 0));

    logs.length = 0;
    const second = await makeVoiceOnly(dir, { log: (m) => logs.push(m) });
    assert.equal(second.ok, true);
    assert.ok(logs.some((l) => /cache hit/.test(l)), logs.join('\n'));

    const project = loadProject(dir);
    for (const s of project.script.scenes) {
      const check = second.checks.find((c) => c.id === s.id);
      assert.ok(check.ok, `${s.id} delta ${check.deltaMs}`);
      assert.ok(check.deltaMs <= 50);
    }
  });

  it('CLI --voice-only exits 0', () => {
    const r = run(['make', dir, '--voice-only']);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /measured/);
  });
});
