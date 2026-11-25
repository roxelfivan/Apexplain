import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { describe, it } from 'node:test';
import {
  chapterAt,
  chromeGeometry,
  drawProgressChrome,
  resolveChapters,
  storyboardChapters,
} from '../src/chrome.js';
import { drawCaption } from '../src/captions.js';
import { createFrameContext } from '../src/engine.js';

const timeline = {
  duration: 20,
  scenes: [
    { id: 'open', start: 0, dur: 4 },
    { id: 'why', start: 4, dur: 6 },
    { id: 'fix', start: 10, dur: 6 },
    { id: 'close', start: 16, dur: 4 },
  ],
};

const ctxFor = (size = '16:9') => {
  const { width, height, theme, safe, type } = createFrameContext({ size });
  const canvas = createCanvas(width, height);
  return { ctx: canvas.getContext('2d'), width, height, theme, safe, type };
};

describe('phase 3 chrome', () => {
  it('is off unless video.progress is true', () => {
    const off = resolveChapters({ video: { progress: false }, timeline });
    assert.equal(off.enabled, false);
    assert.deepEqual(off.items, []);
    const on = resolveChapters({ video: { progress: true }, timeline });
    assert.equal(on.enabled, true);
  });

  it('splits explicit chapters across scenes', () => {
    const c = resolveChapters({
      video: { progress: true, chapters: ['Intro', 'Why', 'Fix'] },
      timeline,
    });
    assert.equal(c.items.length, 3);
    assert.equal(c.items[0].label, 'Intro');
    assert.equal(c.items[0].from, 0);
    assert.equal(c.items[2].to, 3);
    assert.ok(c.items[0].start < c.items[1].start);
  });

  it('derives chapters from storyboard headings when labels are blank', () => {
    const storyboard = '# Storyboard\n\n## Why it happens\n\nnotes\n\n## The fix\n\nmore\n';
    const board = storyboardChapters(storyboard);
    assert.equal(board.length, 2);
    assert.equal(board[0].label, 'Why it happens');
    const c = resolveChapters({ video: { progress: true }, timeline, storyboard });
    assert.ok(c.items.length >= 1);
    assert.equal(c.items[0].label, 'Why it happens');
  });

  it('reports the chapter for a time position', () => {
    const c = resolveChapters({
      video: { progress: true, chapters: ['Intro', 'Why', 'Fix'] },
      timeline,
    });
    assert.equal(chapterAt(c, 0), 0);
    assert.ok(chapterAt(c, 15) >= 1);
  });

  it('draws the strip below the safe area and reports elements', () => {
    const { ctx, width, height, theme, safe, type } = ctxFor();
    const c = resolveChapters({
      video: { progress: true, chapters: ['Intro', 'Why'] },
      timeline,
    });
    const els = drawProgressChrome(ctx, {
      chapters: c,
      progress: 0.5,
      chapterIndex: 0,
      width,
      height,
      theme,
      safe,
      type,
      lang: 'en',
    });
    assert.ok(els.length >= 2);
    const bar = els.find((e) => e.path === 'video.json/progress');
    assert.ok(bar);
    // Chrome lives under the safe area so scene content stays clear.
    assert.ok(bar.y >= safe.y + safe.h);
  });

  it('geometry keeps the strip inside the frame', () => {
    const { width, height, safe, type } = ctxFor();
    const g = chromeGeometry({ width, height, safe, type });
    assert.ok(g.barY + g.barH <= height);
    assert.ok(g.inset > 0);
  });

  it('captions lift above the chrome strip when inset is applied', () => {
    const { ctx, width, height, theme } = ctxFor();
    const plain = createCanvas(width, height).getContext('2d');
    drawCaption(plain, 'Hello world', { width, height, theme, lang: 'en' });
    const raised = createCanvas(width, height).getContext('2d');
    drawCaption(raised, 'Hello world', {
      width,
      height,
      theme,
      lang: 'en',
      bottomInset: 120,
    });
    const pixels = (c) => {
      const data = c.getImageData(0, 0, width, height).data;
      let first = -1;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 10 && data[i] < 60 && data[i + 1] < 60) {
          first = Math.floor(i / 4 / width);
          break;
        }
      }
      return first;
    };
    const a = pixels(plain);
    const b = pixels(raised);
    assert.ok(a > 0 && b > 0);
    assert.ok(b < a, 'caption with inset should start higher in the frame');
  });
});
