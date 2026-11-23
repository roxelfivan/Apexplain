import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { ApexError } from '../src/errors.js';
import { checkLayout, renderSceneFrame } from '../src/engine.js';
import { previewProject } from '../src/preview.js';
import { safeArea, typeScale } from '../src/theme.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'bin', 'apexplain.js');
const fixture = path.join(root, 'test', 'fixtures', 'leap-years');

function run(args) {
  return spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8' });
}

const video = { size: '16:9', theme: 'studio' };

describe('renderSceneFrame', () => {
  it('renders each of the five layouts to a PNG', () => {
    const layouts = {
      title: { layout: 'title', title: 'Hello', subtitle: 'World' },
      cards: {
        layout: 'cards',
        items: [
          { icon: 'globe', text: 'One' },
          { icon: 'calendar', text: 'Two' },
        ],
      },
      steps: {
        layout: 'steps',
        cue: 'sentence',
        items: [
          { icon: 'lightbulb', text: 'First' },
          { icon: 'list', text: 'Second' },
        ],
      },
      compare: {
        layout: 'compare',
        left: { title: 'A', text: 'Left side' },
        right: { title: 'B', text: 'Right side', icon: 'check' },
      },
      flow: {
        layout: 'flow',
        items: [{ text: 'Start' }, { text: 'Middle' }, { text: 'End' }],
      },
    };

    for (const [id, layout] of Object.entries(layouts)) {
      const frame = renderSceneFrame({
        video,
        sceneId: id,
        layout,
        t: Infinity,
      });
      assert.ok(frame.png.length > 100, id);
      assert.equal(frame.png[0], 0x89);
      assert.ok(frame.els.length > 0, id);
      checkLayout(frame.els, { safe: frame.safe, type: frame.type, sceneId: id });
    }
  });

  it('rejects unknown icons with path+rule', () => {
    assert.throws(
      () =>
        renderSceneFrame({
          video,
          sceneId: 'main',
          layout: { layout: 'steps', items: [{ icon: 'not-a-real-icon', text: 'Hi' }] },
        }),
      (err) => {
        assert.ok(err instanceof ApexError);
        assert.equal(err.rule, 'icon');
        assert.equal(err.path, 'scenes.json/main/items/0/icon');
        return true;
      },
    );
  });
});

describe('checkLayout', () => {
  it('fails overflow with path+rule', () => {
    const safe = safeArea(1920, 1080);
    const type = typeScale(1080);
    assert.throws(
      () =>
        checkLayout(
          [{ kind: 'text', path: 'scenes.json/x/title', x: -50, y: 100, w: 200, h: 40, x1: 150, y1: 140, fontSize: 40, alpha: 1 }],
          { safe, type, sceneId: 'x' },
        ),
      (err) => {
        assert.equal(err.rule, 'overflow');
        assert.equal(err.path, 'scenes.json/x/title');
        return true;
      },
    );
  });

  it('fails min type size with path+rule', () => {
    const safe = safeArea(1920, 1080);
    const type = { ...typeScale(1080), minReadable: 40 };
    assert.throws(
      () =>
        checkLayout(
          [
            {
              kind: 'text',
              path: 'scenes.json/x/items/0/text',
              x: safe.x + 10,
              y: safe.y + 10,
              w: 100,
              h: 20,
              x1: safe.x + 110,
              y1: safe.y + 30,
              fontSize: 12,
              alpha: 1,
            },
          ],
          { safe, type, sceneId: 'x' },
        ),
      (err) => {
        assert.equal(err.rule, 'min_type_size');
        return true;
      },
    );
  });
});

describe('preview', () => {
  it('writes still PNGs for leap-years fixture', () => {
    const result = previewProject(fixture);
    assert.equal(result.ok, true);
    assert.equal(result.files.length, 8);
    for (const f of result.files) {
      assert.ok(fs.existsSync(f));
      assert.ok(fs.statSync(f).size > 500);
    }
  });

  it('CLI preview exits 0 on a fresh init project', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apexplain-prev-'));
    const dir = path.join(tmp, 'demo');
    const init = run(['init', dir, '--title', 'Preview']);
    assert.equal(init.status, 0, init.stderr);
    const prev = run(['preview', dir]);
    assert.equal(prev.status, 0, prev.stderr + prev.stdout);
    assert.match(prev.stdout, /layout check passed/);
    assert.ok(fs.existsSync(path.join(dir, 'build', 'stills', 'intro.png')));
  });
});
