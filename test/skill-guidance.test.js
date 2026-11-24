import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildAutogenerateSystemPrompt,
  loadSkillMarkdown,
  skillBodyForAutogenerate,
  stripFrontmatter,
} from '../src/skill-guidance.js';
import { layoutFor } from '../src/generate.js';

describe('skill-guidance', () => {
  it('loads SKILL.md without frontmatter for autogenerate', () => {
    const raw = loadSkillMarkdown({ force: true });
    assert.match(raw, /^---/);
    const body = skillBodyForAutogenerate(raw);
    assert.doesNotMatch(body, /^---/);
    assert.doesNotMatch(body, /^## Commands/m);
    assert.match(body, /## Layouts/);
    assert.match(body, /## Script rules/);
    assert.match(body, /put `motion` on scenes/);
    assert.match(body, /countUp/);
  });

  it('system prompt embeds the skill and output contract', () => {
    const p = buildAutogenerateSystemPrompt({ lang: 'en', boardActive: false });
    assert.match(p, /source of truth/);
    assert.match(p, /stat/);
    assert.match(p, /globe-wire/);
    assert.match(p, /Autogenerate output contract/);
    assert.match(p, /ALWAYS include a per-scene "motion"/);
    assert.match(p, /layoutHints/);
    assert.match(p, /timeline/);
    assert.match(p, /Do NOT round-robin/);
    assert.doesNotMatch(p, /omit unless/);
    const withLen = buildAutogenerateSystemPrompt({ lang: 'en', targetSeconds: 75 });
    assert.match(withLen, /about 75 seconds/);
    assert.match(withLen, /LENGTH \(read first/);
    assert.ok(withLen.indexOf('LENGTH (read first') < withLen.indexOf('Apexplain skill'));
    const withHint = buildAutogenerateSystemPrompt({
      lang: 'en',
      targetSeconds: 90,
      lengthHint: 'HARD length requirement: finished video ≈90s',
    });
    assert.match(withHint, /HARD length requirement: finished video ≈90s/);
    assert.match(withHint, /scriptSkeleton/);
  });

  it('stripFrontmatter is idempotent on body-only text', () => {
    assert.equal(stripFrontmatter('# Hi\n'), '# Hi');
  });
});

describe('layoutFor skill alignment', () => {
  it('maps one big number beats to stat', () => {
    assert.equal(layoutFor('topic', 'Key percent rate'), 'stat');
  });
});
