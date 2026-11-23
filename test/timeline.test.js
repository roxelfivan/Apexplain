import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { loadProject } from '../src/project.js';
import { makeDryRun } from '../src/make.js';
import { buildEstimatedTimeline, estimateLength, estimateLine } from '../src/timeline.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(root, 'test', 'fixtures', 'leap-years');

describe('estimateLength', () => {
  it('estimates leap-years fixture in the 45–90s band', () => {
    const project = loadProject(fixture);
    const e = estimateLength(project);
    assert.ok(e);
    assert.ok(e.seconds >= 45 && e.seconds <= 90, `expected 45–90s, got ${e.seconds}`);
    assert.ok(e.low < e.seconds && e.high > e.seconds);
    assert.match(estimateLine(e), /about \d+ s/);
  });
});

describe('buildEstimatedTimeline', () => {
  it('has one scene entry and cues for markers/items', () => {
    const project = loadProject(fixture);
    const tl = buildEstimatedTimeline(project);
    assert.equal(tl.kind, 'estimated');
    assert.equal(tl.scenes.length, 8);
    assert.ok(tl.duration > 0);
    assert.ok(tl.cues.some((c) => c.type === 'scene'));
    assert.ok(tl.cues.some((c) => c.type === 'marker' && c.name === 'orbit'));
    assert.ok(tl.cues.some((c) => c.type === 'item'));

    const orbit = tl.scenes.find((s) => s.id === 'orbit');
    assert.equal(orbit.sentences.length, 2);
    assert.ok(orbit.marks.orbit != null);
    assert.equal(orbit.itemCues.length, 2);
  });
});

describe('make --estimate', () => {
  it('writes build/timeline.json', () => {
    const result = makeDryRun(fixture, { estimateOnly: true });
    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(result.timeline.file));
    const saved = JSON.parse(fs.readFileSync(result.timeline.file, 'utf8'));
    assert.equal(saved.kind, 'estimated');
    assert.equal(saved.scenes.length, 8);
    assert.ok(result.estimate.seconds >= 45);
  });
});
