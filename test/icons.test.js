import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import {
  ICON_ALIASES,
  ICON_NAMES,
  coerceIconName,
  hasIcon,
  iconPaths,
} from '../src/icons.js';
import { normalizeLlmScenes } from '../src/llm/parse.js';

const require = createRequire(import.meta.url);
const lucideNodes = require('lucide-static/icon-nodes.json');

describe('icon allowlist', () => {
  it('every ICON_NAMES entry exists in lucide-static', () => {
    const missing = ICON_NAMES.filter((n) => !lucideNodes[n]);
    assert.deepEqual(missing, []);
  });

  it('every alias target is loadable', () => {
    for (const [alias, target] of Object.entries(ICON_ALIASES)) {
      assert.ok(hasIcon(target), `alias ${alias} → ${target}`);
      assert.ok(hasIcon(alias), `alias name ${alias}`);
      assert.ok(iconPaths(alias).length > 0, `paths for ${alias}`);
    }
  });

  it('covers icons used in japan-travel-plan Autogenerate output', () => {
    for (const name of [
      'route',
      'coffee',
      'utensils',
      'ticket',
      'hotel',
      'bed',
      'mountain',
      'waves',
      'refresh-cw',
      'map-pinned',
      'list-checks',
      'accessibility',
      'battery-charging',
      'calendar-x',
      'train',
      'home',
      'paw',
    ]) {
      assert.ok(hasIcon(name), name);
    }
  });

  it('coerceIconName remaps aliases and drops unknowns', () => {
    assert.equal(coerceIconName('train'), 'train-front');
    assert.equal(coerceIconName('ROUTE'), 'route');
    assert.equal(coerceIconName('not-a-real-icon-xyz'), null);
  });

  it('normalizeLlmScenes remaps or drops bad icons', () => {
    const scenes = normalizeLlmScenes({
      a: {
        layout: 'steps',
        cue: 'sentence',
        items: [
          { icon: 'train', text: 'Rail' },
          { icon: 'totally-fake-icon', text: 'Nope' },
          { icon: 'coffee', text: 'Cafe' },
        ],
      },
    });
    assert.equal(scenes.a.items[0].icon, 'train-front');
    assert.equal(scenes.a.items[1].icon, undefined);
    assert.equal(scenes.a.items[2].icon, 'coffee');
  });
});
