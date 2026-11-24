import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApexError } from '../src/errors.js';
import { parseScript } from '../src/script.js';
import { crossCheck, validateScenes } from '../src/scenes.js';

describe('validateScenes', () => {
  it('accepts the core layouts including stat and chart', () => {
    const scenes = validateScenes({
      a: { layout: 'title', title: 'Hi', subtitle: 'there', clipart: 'stack' },
      b: {
        layout: 'steps',
        cue: 'sentence',
        items: [{ icon: 'globe', clipart: 'db', text: 'One' }],
      },
      c: {
        layout: 'cards',
        items: [{ text: 'Card' }],
      },
      d: {
        layout: 'compare',
        left: { title: 'A', text: 'left', clipart: 'doc' },
        right: { text: 'right', icon: 'check' },
      },
      e: {
        layout: 'flow',
        items: [{ text: 'Step', clipart: 'funnel' }, { text: 'Next', at: 0 }],
      },
      f: {
        layout: 'stat',
        value: '42',
        unit: '%',
        caption: 'Hit rate',
        clipart: 'bars',
      },
      g: {
        layout: 'chart',
        kind: 'bar',
        title: 'Cost',
        series: [
          { label: 'A', value: 1 },
          { label: 'B', value: 3 },
        ],
        highlight: 1,
      },
    });
    assert.equal(Object.keys(scenes).length, 7);
  });

  it('rejects unknown clipart', () => {
    assert.throws(
      () => validateScenes({ intro: { layout: 'title', title: 'x', clipart: 'unicorn' } }),
      (err) => {
        assert.equal(err.path, 'scenes.json/intro/clipart');
        assert.equal(err.rule, 'clipart');
        return true;
      },
    );
  });

  it('rejects unknown layout with path+rule', () => {
    assert.throws(
      () => validateScenes({ intro: { layout: 'wizard', title: 'x' } }),
      (err) => {
        assert.ok(err instanceof ApexError);
        assert.equal(err.path, 'scenes.json/intro/layout');
        assert.equal(err.rule, 'enum');
        return true;
      },
    );
  });

  it('rejects missing item text', () => {
    assert.throws(
      () => validateScenes({ main: { layout: 'steps', items: [{ icon: 'x' }] } }),
      (err) => {
        assert.equal(err.path, 'scenes.json/main/items/0/text');
        assert.equal(err.rule, 'required');
        return true;
      },
    );
  });
});

describe('crossCheck', () => {
  it('requires matching script and scenes ids', () => {
    const script = parseScript('## intro\nHello.\n');
    assert.throws(
      () => crossCheck(script, validateScenes({ other: { layout: 'title', title: 'x' } })),
      (err) => {
        assert.equal(err.rule, 'missing_scene');
        assert.equal(err.path, 'scenes.json/intro');
        return true;
      },
    );
  });

  it('rejects unknown markers on items', () => {
    const script = parseScript('## main\n[#real] Hello.\n');
    const scenes = validateScenes({
      main: {
        layout: 'steps',
        items: [{ text: 'Hi', marker: 'missing' }],
      },
    });
    assert.throws(
      () => crossCheck(script, scenes),
      (err) => {
        assert.equal(err.rule, 'unknown_marker');
        assert.equal(err.path, 'scenes.json/main/items/0/marker');
        return true;
      },
    );
  });

  it('passes a matching starter-like project', () => {
    const script = parseScript(`# T
## intro
Hello.

## main
One. Two. Three.

## outro
Bye.
`);
    const scenes = validateScenes({
      intro: { layout: 'title', title: 'T' },
      main: {
        layout: 'steps',
        cue: 'sentence',
        items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      },
      outro: { layout: 'title', title: 'Done' },
    });
    const notes = crossCheck(script, scenes);
    assert.deepEqual(notes, []);
  });
});
