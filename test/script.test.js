import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApexError } from '../src/errors.js';
import { parseScript, tokenizeNarration, speechChunks } from '../src/script.js';

describe('parseScript', () => {
  it('parses title, scenes, markers, pauses, and overrides', () => {
    const script = parseScript(`# Demo

## intro
Hello [#hook] world. [pause 0.4]
{API|A P I} rocks.

## outro {hold=1.5}
Bye.
`);
    assert.equal(script.title, 'Demo');
    assert.equal(script.scenes.length, 2);
    assert.equal(script.scenes[0].id, 'intro');
    assert.ok('hook' in script.scenes[0].marks);
    assert.equal(script.scenes[0].sentenceCount, 2);
    assert.match(script.scenes[0].spoken, /A P I/);
    assert.match(script.scenes[0].text, /API/);
    assert.equal(script.scenes[1].attrs.hold, 1.5);
  });

  it('ignores > notes and HTML comments', () => {
    const script = parseScript(`## main
> director note
Hello. <!-- skip this --> World.
`);
    assert.equal(script.scenes[0].text, 'Hello. World.');
  });

  it('rejects duplicate scene ids with path+rule', () => {
    assert.throws(
      () => parseScript('## a\nHi.\n## a\nBye.\n'),
      (err) => {
        assert.ok(err instanceof ApexError);
        assert.equal(err.rule, 'unique_id');
        assert.match(err.path, /script\.md/);
        return true;
      },
    );
  });
});

describe('tokenizeNarration', () => {
  it('splits words marks and pauses', () => {
    const units = tokenizeNarration('Say [#a] this [pause 0.2] now.');
    assert.deepEqual(
      units.map((u) => u.type),
      ['word', 'mark', 'word', 'pause', 'word'],
    );
  });

  it('treats brace groups without | as plain text (LLM-friendly)', () => {
    const units = tokenizeNarration('Visit {Tokyo} next.');
    assert.equal(
      units.filter((u) => u.type === 'word').map((u) => u.display).join(' '),
      'Visit Tokyo next.',
    );
  });

  it('still applies {shown|spoken} pronunciation overrides', () => {
    const units = tokenizeNarration('{API|A P I} rocks.');
    const words = units.filter((u) => u.type === 'word');
    assert.equal(words[0].display, 'API');
    assert.equal(words[0].spoken, 'A P I');
  });
});

describe('speechChunks', () => {
  it('splits on sentence endings', () => {
    const units = tokenizeNarration('One. Two!');
    const chunks = speechChunks(units);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].text, 'One.');
    assert.equal(chunks[1].text, 'Two!');
  });
});
