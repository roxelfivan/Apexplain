import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { generateExplainer } from '../src/generate.js';
import {
  loadLlmSettings,
  normalizeLlmSettings,
  publicLlmSettings,
  saveLlmSettings,
} from '../src/llm/config.js';
import { llmReady } from '../src/llm/complete.js';
import { parseLlmExplainer } from '../src/llm/parse.js';

const prevConfig = process.env.APEXPLAIN_CONFIG;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apexplain-llm-'));

before(() => {
  process.env.APEXPLAIN_CONFIG = tmp;
  delete process.env.APEXPLAIN_MINIMAX_API_KEY;
  delete process.env.MINIMAX_API_KEY;
});

after(() => {
  if (prevConfig == null) delete process.env.APEXPLAIN_CONFIG;
  else process.env.APEXPLAIN_CONFIG = prevConfig;
});

describe('llm settings', () => {
  it('defaults to local Gemma and stores MiniMax key at 0600', () => {
    const empty = loadLlmSettings();
    assert.equal(empty.provider, 'local-gemma');
    assert.equal(empty.apiKey, '');

    const saved = saveLlmSettings({
      provider: 'minimax',
      apiKey: 'sk-test-secret-key',
    });
    assert.equal(saved.provider, 'minimax');
    assert.equal(saved.model, 'MiniMax-M2.7');
    assert.match(saved.apiEndpoint, /minimax\.io/);
    assert.equal(saved.apiKey, 'sk-test-secret-key');

    const pub = publicLlmSettings(saved);
    assert.equal(pub.apiKeySet, true);
    assert.equal(pub.apiKeyHint, '••••-key');
    assert.ok(!JSON.stringify(pub).includes('sk-test-secret-key'));

    const file = path.join(tmp, 'llm.json');
    const mode = fs.statSync(file).mode & 0o777;
    assert.equal(mode, 0o600);

    const kept = saveLlmSettings({ provider: 'minimax', apiKey: '' });
    assert.equal(kept.apiKey, 'sk-test-secret-key');
    const cleared = saveLlmSettings({ clearApiKey: true });
    assert.equal(cleared.apiKey, '');
  });

  it('normalizes unknown provider to local-gemma', () => {
    const n = normalizeLlmSettings({ provider: 'openai', apiKey: 'x' });
    assert.equal(n.provider, 'local-gemma');
  });
});

describe('parse LLM explainer JSON', () => {
  it('accepts fenced JSON and validates against Apexplain schema', () => {
    const payload = {
      script: `# Cats\n\n## open\n[#hook] Let's talk about cats. [#angle] They are small hunters.\n\n## traits\n[#point] What makes a cat distinct. [#fact] Cats hunt alone. [#more] They hear high sounds.\n\n## close {hold=1.5}\n[#close] Remember cats. [#thanks] Thanks for watching.\n`,
      scenes: {
        open: { layout: 'title', title: 'Cats', subtitle: 'Small hunters' },
        traits: {
          layout: 'cards',
          cue: 'sentence',
          items: [
            { icon: 'heart', text: 'Hunt alone' },
            { icon: 'zap', text: 'Sharp hearing' },
            { icon: 'star', text: 'Thanks' },
          ],
        },
        close: { layout: 'title', title: 'Remember cats', subtitle: 'Thanks' },
      },
    };
    const parsed = parseLlmExplainer('Here you go:\n```json\n' + JSON.stringify(payload) + '\n```\n');
    assert.ok(parsed.script.includes('## open'));
    assert.equal(parsed.scenes.open.layout, 'title');
    assert.equal(parsed.scenes.traits.items.length, 3);
  });

  it('rejects missing script', () => {
    assert.throws(() => parseLlmExplainer('{"scenes":{}}'), /missing string "script"/);
  });
});

describe('generateExplainer LLM backend', () => {
  it('uses injected complete() instead of Wikipedia', async () => {
    let calls = 0;
    const complete = async () => {
      calls += 1;
      return JSON.stringify({
        script: `# Leap years\n\n## open\n[#hook] Let's talk about leap years. [#angle] Calendars drift.\n\n## cause\n[#point] Why it happens. [#fact] Earth takes longer than 365 days. [#more] Extra days catch up.\n\n## close {hold=1.5}\n[#close] Hold onto the extra day. [#thanks] Thanks for watching.\n`,
        scenes: {
          open: { layout: 'title', title: 'Leap years', subtitle: 'Calendars drift' },
          cause: {
            layout: 'flow',
            cue: 'sentence',
            items: [
              { icon: 'globe', text: 'Orbit is ~365.24 days' },
              { icon: 'calendar', text: 'Year is 365 days' },
              { icon: 'clock', text: 'Leap day catches up' },
            ],
          },
          close: { layout: 'title', title: 'Extra day', subtitle: 'Thanks' },
        },
      });
    };
    const g = await generateExplainer({
      title: 'Why leap years exist',
      lang: 'en',
      complete,
    });
    assert.equal(calls, 1);
    assert.equal(g.source, 'injected');
    assert.match(g.script, /leap years/i);
    assert.equal(g.scenes.cause.layout, 'flow');
  });

  it('retries once when the first completion is not JSON', async () => {
    let calls = 0;
    const complete = async () => {
      calls += 1;
      if (calls === 1) return 'sorry, here is a poem';
      return JSON.stringify({
        script: `# Cat\n\n## open\nHello cat. More cat.\n\n## close {hold=1}\nBye cat. Thanks.\n`,
        scenes: {
          open: { layout: 'title', title: 'Cat', subtitle: 'Hello' },
          close: { layout: 'title', title: 'Bye', subtitle: 'Thanks' },
        },
      });
    };
    const g = await generateExplainer({ title: 'What is a cat?', complete });
    assert.equal(calls, 2);
    assert.match(g.script, /Hello cat/);
  });
});

describe('llmReady mock', () => {
  it('treats APEXPLAIN_LLM=mock as ready', () => {
    const prev = process.env.APEXPLAIN_LLM;
    process.env.APEXPLAIN_LLM = 'mock';
    try {
      const r = llmReady({ provider: 'minimax', apiKey: '' });
      assert.equal(r.ok, true);
      assert.equal(r.provider, 'mock');
    } finally {
      if (prev == null) delete process.env.APEXPLAIN_LLM;
      else process.env.APEXPLAIN_LLM = prev;
    }
  });
});
