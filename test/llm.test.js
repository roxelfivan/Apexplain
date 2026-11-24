import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  buildExplainerMessages,
  generateExplainer,
  outlineFromStoryboard,
  storyboardIsActive,
} from '../src/generate.js';
import {
  loadLlmSettings,
  normalizeLlmSettings,
  publicLlmSettings,
  saveLlmSettings,
} from '../src/llm/config.js';
import { llmReady } from '../src/llm/complete.js';
import { normalizeLlmScenes, parseLlmExplainer } from '../src/llm/parse.js';

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

  it('strips MiniMax <think> reasoning that contains brace noise like {spoken}', () => {
    const payload = {
      script: `# Cat\n\n## open\n[#hook] Hello cat. [#angle] More cat.\n\n## close {hold=1}\n[#close] Bye. [#thanks] Thanks.\n`,
      scenes: {
        open: { layout: 'title', title: 'Cat', subtitle: 'Hello' },
        close: { layout: 'title', title: 'Bye', subtitle: 'Thanks' },
      },
    };
    const text =
      `<think>\nOptional {spoken} and [pause]. Return { "script": "…" } only.\n</think>\n` +
      JSON.stringify(payload);
    const parsed = parseLlmExplainer(text);
    assert.match(parsed.script, /Hello cat/);
    assert.equal(parsed.scenes.open.layout, 'title');
  });

  it('coerces narration-text cue values to "sentence"', () => {
    const payload = {
      script: `# Cat\n\n## open\n[#hook] Hello. [#angle] More.\n\n## traits\n[#point] One. [#fact] Two. [#more] Three.\n\n## close {hold=1}\n[#close] Bye. [#thanks] Thanks.\n`,
      scenes: {
        open: { layout: 'title', title: 'Cat', subtitle: 'Hello', cue: 'ignore me' },
        traits: {
          layout: 'cards',
          cue: 'A cat is a small mammal.',
          items: [
            { icon: 'heart', text: 'One' },
            { icon: 'zap', text: 'Two' },
            { icon: 'star', text: 'Three' },
          ],
        },
        close: { layout: 'title', title: 'Bye', subtitle: 'Thanks' },
      },
    };
    const parsed = parseLlmExplainer(JSON.stringify(payload));
    assert.equal(parsed.scenes.traits.cue, 'sentence');
    assert.equal(parsed.scenes.open.cue, undefined);
  });
});

describe('normalizeLlmScenes', () => {
  it('defaults item layouts to cue sentence and strips cue on title', () => {
    const n = normalizeLlmScenes({
      open: { layout: 'title', title: 'T', cue: 'nope' },
      mid: { layout: 'steps', items: [{ text: 'a' }] },
    });
    assert.equal(n.open.cue, undefined);
    assert.equal(n.mid.cue, 'sentence');
  });

  it('remaps Lucide-ish clipart names like map → globe-wire', () => {
    const n = normalizeLlmScenes({
      mid: { layout: 'steps', items: [{ text: 'Tokyo', clipart: 'map' }] },
    });
    assert.equal(n.mid.items[0].clipart, 'globe-wire');
  });

  it('strips item clipart on dense flow/steps lists to avoid overflow', () => {
    const n = normalizeLlmScenes({
      a: {
        layout: 'flow',
        cue: 'sentence',
        items: [
          { text: 'A', icon: 'plane', clipart: 'nodes' },
          { text: 'B', icon: 'map', clipart: 'stack' },
          { text: 'C', icon: 'train' },
          { text: 'D', icon: 'bus', clipart: 'nodes' },
        ],
      },
    });
    assert.equal(n.a.items[0].clipart, undefined);
    assert.equal(n.a.items[0].icon, 'plane');
    assert.equal(n.a.items[3].clipart, undefined);
    assert.equal(n.a.items[2].icon, 'train-front');
  });
});

describe('storyboard outline', () => {
  it('ignores empty / comment-only template storyboards', () => {
    assert.equal(
      storyboardIsActive('# Storyboard (optional)\n\n<!-- note -->\n'),
      false,
    );
  });

  it('builds outline from ## beats and injects storyboard into messages', () => {
    const board = `## open — Hook\nSay what a cat is\n\n## traits\nWhiskers and claws\n\n## close\nThanks\n`;
    assert.equal(storyboardIsActive(board), true);
    const outline = outlineFromStoryboard(board, { intent: 'definition', subject: 'cat', lang: 'en' });
    assert.equal(outline[0].id, 'open');
    assert.equal(outline[0].role, 'open');
    assert.equal(outline[1].id, 'traits');
    assert.equal(outline[2].role, 'close');
    const msgs = buildExplainerMessages({
      topic: 'What is a cat?',
      subject: 'cat',
      intent: 'definition',
      outline,
      lang: 'en',
      storyboard: board,
    });
    assert.match(msgs[1].content, /storyboard/);
    assert.match(msgs[1].content, /Whiskers and claws/);
    // System prompt is derived from skills/apexplain/SKILL.md
    assert.match(msgs[0].content, /Apexplain skill/);
    assert.match(msgs[0].content, /Never invent numbers/);
    assert.match(msgs[0].content, /Layouts/);
    assert.match(msgs[0].content, /clipart/);
  });

  it('passes storyboard into generateExplainer complete()', async () => {
    let saw = '';
    const complete = async (messages) => {
      saw = JSON.stringify(messages);
      return JSON.stringify({
        script: `# Cat\n\n## open\nHello.\n\n## close {hold=1}\nBye.\n`,
        scenes: {
          open: { layout: 'title', title: 'Cat', subtitle: 'Hi' },
          close: { layout: 'title', title: 'Bye', subtitle: 'Thanks' },
        },
      });
    };
    const g = await generateExplainer({
      title: 'What is a cat?',
      storyboard: '## open\nHook\n\n## close\nOutro\n',
      complete,
    });
    assert.equal(g.storyboard, true);
    assert.match(saw, /storyboard/);
    assert.match(saw, /Use the storyboard as the base/);
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

  it('puts hard length + minSentences into the first draft prompt (no length rewrite)', async () => {
    let calls = 0;
    let firstUser = '';
    let system = '';
    const complete = async (msgs) => {
      calls += 1;
      system = msgs.find((m) => m.role === 'system')?.content || '';
      firstUser = msgs.find((m) => m.role === 'user')?.content || '';
      return JSON.stringify({
        script:
          '# Cat\n\n## open\n[#hook] Cats are companions. [#angle] People keep them.\n\n' +
          '## close {hold=1}\n[#close] Thanks. [#thanks] Bye.\n',
        scenes: {
          open: { layout: 'title', title: 'Cat', subtitle: 'Pet' },
          close: { layout: 'title', title: 'Thanks', subtitle: 'Bye' },
        },
      });
    };
    const g = await generateExplainer({
      title: 'What is a cat?',
      lang: 'en',
      targetSeconds: 90,
      complete,
    });
    assert.equal(calls, 1);
    assert.equal(g.lengthRewritten, undefined);
    assert.match(firstUser, /HARD length requirement/i);
    assert.match(firstUser, /minSentences/i);
    assert.match(firstUser, /minWords/i);
    assert.match(firstUser, /scriptSkeleton/i);
    assert.match(firstUser, /"targetSeconds": 90/);
    assert.match(system, /LENGTH \(read first/i);
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
