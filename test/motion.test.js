import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  drawOn,
  drawOnMotion,
  formatCountUp,
  formatCountUpMotion,
  resolveMotion,
  softIn,
  softInMotion,
  validateMotion,
} from '../src/motion.js';
import { renderSceneFrame } from '../src/engine.js';
import { loadProject } from '../src/project.js';
import { ApexError } from '../src/errors.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const video = { size: '16:9', theme: 'dark' };
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('softIn', () => {
  it('is hidden before at, settled after fade', () => {
    assert.equal(softIn(0, 1).alpha, 0);
    assert.ok(softIn(0, 1).dy > 0);
    assert.equal(softIn(Infinity, 0).alpha, 1);
    assert.equal(softIn(Infinity, 0).dy, 0);
    const mid = softIn(1.2, 1, { fade: 0.4 });
    assert.ok(mid.alpha > 0 && mid.alpha < 1);
  });
});

describe('drawOn / countUp display', () => {
  it('grows 0→1 and formats ~2 ms', () => {
    assert.equal(drawOn(0, 1), 0);
    assert.equal(drawOn(Infinity, 0), 1);
    assert.equal(formatCountUp(Infinity, 0, '~2 ms'), '~2 ms');
    const mid = formatCountUp(0.35, 0, '42', { dur: 0.7 });
    assert.match(mid, /^\d+$/);
    assert.ok(Number(mid) < 42);
  });
});

describe('resolveMotion / validateMotion', () => {
  it('merges video then scene overrides', () => {
    const m = resolveMotion({ fade: 0.5, stagger: 0.1 }, { fade: 0.2, drawOn: 0.9 });
    assert.equal(m.fade, 0.2);
    assert.equal(m.stagger, 0.1);
    assert.equal(m.drawOn, 0.9);
    assert.equal(m.enabled, true);
  });

  it('rejects unknown keys and out-of-range values', () => {
    assert.throws(() => validateMotion({ bounce: 1 }, 'motion'), ApexError);
    assert.throws(() => validateMotion({ fade: 99 }, 'motion'), ApexError);
  });

  it('enabled:false snaps SoftIn and count-up', () => {
    const off = resolveMotion({ enabled: false });
    assert.equal(softInMotion(0.1, 0, off).alpha, 1);
    assert.equal(softInMotion(0.1, 1, off).alpha, 0);
    assert.equal(drawOnMotion(0.1, 0, off), 1);
    assert.equal(formatCountUpMotion(0.1, 0, '42', off), '42');
    assert.equal(formatCountUpMotion(0.1, 1, '42', off), '');
  });
});

describe('declarative motion in render', () => {
  it('video.motion slidePx changes SoftIn dy', () => {
    const layout = { layout: 'title', title: 'Hello' };
    const timeline = { lead: 0 };
    const big = renderSceneFrame({
      video: { size: '16:9', theme: 'studio', motion: { fade: 0.8, slidePx: 40 } },
      sceneId: 't',
      layout,
      sceneTimeline: timeline,
      t: 0.05,
    });
    const small = renderSceneFrame({
      video: { size: '16:9', theme: 'studio', motion: { fade: 0.8, slidePx: 4 } },
      sceneId: 't',
      layout,
      sceneTimeline: timeline,
      t: 0.05,
    });
    // Both should show the title while mid-fade; frames differ because slide differs.
    assert.ok(big.els.some((e) => e.kind === 'title'));
    assert.ok(small.els.some((e) => e.kind === 'title'));
    assert.notEqual(big.png.equals(small.png), true);
  });

  it('scene.motion.enabled false shows settled frame early', () => {
    const layout = {
      layout: 'steps',
      cue: 'sentence',
      items: [
        { text: 'One', icon: 'lightbulb' },
        { text: 'Two', icon: 'list' },
      ],
      motion: { enabled: false },
    };
    const frame = renderSceneFrame({
      video: { size: '16:9', theme: 'studio', motion: { fade: 0.4 } },
      sceneId: 's',
      layout,
      sceneTimeline: {
        lead: 0,
        itemCues: [
          { item: 0, at: 0, text: 'One' },
          { item: 1, at: 0, text: 'Two' },
        ],
      },
      t: 0,
    });
    assert.equal(frame.els.filter((e) => e.kind === 'text').length, 2);
  });

  it('charts-demo project loads with motion', () => {
    const project = loadProject(path.join(root, 'examples/charts-demo'));
    assert.equal(project.video.motion.enabled, true);
    assert.ok(project.video.motion.fade > 0);
    assert.ok(project.scenes.latency.motion.countUp >= 1);
  });
});

describe('phase2 composition', () => {
  it('compare cue hides the right side early', () => {
    const layout = {
      layout: 'compare',
      cue: 'sentence',
      left: { title: 'A', text: 'Left', clipart: 'doc' },
      right: { title: 'B', text: 'Right', clipart: 'stack' },
    };
    const early = renderSceneFrame({
      video,
      sceneId: 'cmp',
      layout,
      sceneTimeline: {
        lead: 0,
        itemCues: [
          { item: 0, at: 0, text: 'Left' },
          { item: 1, at: 2, text: 'Right' },
        ],
      },
      t: 0.5,
    });
    const rightEls = early.els.filter((e) => String(e.path).includes('/right'));
    assert.equal(rightEls.length, 0);

    const late = renderSceneFrame({
      video,
      sceneId: 'cmp',
      layout,
      sceneTimeline: {
        lead: 0,
        itemCues: [
          { item: 0, at: 0, text: 'Left' },
          { item: 1, at: 2, text: 'Right' },
        ],
      },
      t: 3,
    });
    assert.ok(late.els.some((e) => String(e.path).includes('/right')));
  });

  it('dark theme still renders with backdrop', () => {
    const frame = renderSceneFrame({
      video: { size: '16:9', theme: 'dark' },
      sceneId: 't',
      layout: { layout: 'title', title: 'Hello', clipart: 'stack' },
    });
    assert.ok(frame.png.length > 100);
  });
});
