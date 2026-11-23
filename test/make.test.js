import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { makeDryRun } from '../src/make.js';
import { ApexError } from '../src/errors.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'bin', 'apexplain.js');

function run(args) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

function freshProject() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apexplain-'));
  const dir = path.join(tmp, 'demo');
  const init = run(['init', dir, '--title', 'Leap years']);
  assert.equal(init.status, 0, init.stderr);
  return dir;
}

describe('make --dry-run phase 2', () => {
  it('validates a fresh init project', () => {
    const dir = freshProject();
    const result = makeDryRun(dir);
    assert.equal(result.ok, true);
    assert.deepEqual(result.scenes, ['intro', 'main', 'outro']);
    assert.match(result.message, /schema \+ layout valid|schema valid/);
  });

  it('fails invalid scenes.json with path+rule via CLI --json', () => {
    const dir = freshProject();
    const scenesPath = path.join(dir, 'scenes.json');
    const scenes = JSON.parse(fs.readFileSync(scenesPath, 'utf8'));
    scenes.main.layout = 'nope';
    fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2));

    const r = run(['make', dir, '--dry-run', '--json']);
    assert.notEqual(r.status, 0);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.error.path, 'scenes.json/main/layout');
    assert.equal(body.error.rule, 'enum');
  });

  it('fails when script scene is missing from scenes.json', () => {
    const dir = freshProject();
    const scenesPath = path.join(dir, 'scenes.json');
    const scenes = JSON.parse(fs.readFileSync(scenesPath, 'utf8'));
    delete scenes.outro;
    fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2));

    assert.throws(
      () => makeDryRun(dir),
      (err) => {
        assert.ok(err instanceof ApexError);
        assert.equal(err.rule, 'missing_scene');
        assert.equal(err.path, 'scenes.json/outro');
        return true;
      },
    );
  });
});
