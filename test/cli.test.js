import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'bin', 'apexplain.js');

function run(args, cwd = root) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env },
  });
}

describe('phase 1 cli', () => {
  it('prints version', () => {
    const r = run(['version']);
    assert.equal(r.status, 0);
    assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+$/);
  });

  it('init creates project files and make --dry-run parses scenes', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apexplain-'));
    const dir = path.join(tmp, 'demo');
    const init = run(['init', dir, '--title', 'Leap years', '--size', '16:9']);
    assert.equal(init.status, 0, init.stderr);
    assert.ok(fs.existsSync(path.join(dir, 'video.json')));
    assert.ok(fs.existsSync(path.join(dir, 'script.md')));
    assert.ok(fs.existsSync(path.join(dir, 'scenes.json')));

    const dry = run(['make', dir, '--dry-run']);
    assert.equal(dry.status, 0, dry.stderr + dry.stdout);
    assert.match(dry.stdout, /parsed 3 scenes/);
    assert.match(dry.stdout, /intro, main, outro/);
  });

  it('doctor reports node', () => {
    const r = run(['doctor', '--json']);
    assert.ok(r.status === 0 || r.status === 1);
    const body = JSON.parse(r.stdout);
    assert.equal(body.checks.find((c) => c.name === 'node').ok, true);
  });
});
