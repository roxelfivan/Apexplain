import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { makeFull } from '../src/make.js';
import { parseScript, speechChunks } from '../src/script.js';
import {
  detectIntent,
  extractSubject,
  generateExplainer,
  layoutFor,
  planOutline,
  sceneRelation,
  shortLabel,
} from '../src/generate.js';
import { toTradHk, zhHkCopy } from '../src/zh.js';
import { wrapText } from '../src/text.js';
import { loadProject } from '../src/project.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'bin', 'apexplain.js');

function run(args, env = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, APEXPLAIN_TTS: 'mock', ...env },
  });
}

describe('lang schema', () => {
  it('rejects invalid lang with path+rule', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apexplain-lang-'));
    const dir = path.join(tmp, 'demo');
    assert.equal(run(['init', dir, '--title', 'X']).status, 0);
    const videoPath = path.join(dir, 'video.json');
    const video = JSON.parse(fs.readFileSync(videoPath, 'utf8'));
    video.lang = 'fr';
    fs.writeFileSync(videoPath, JSON.stringify(video, null, 2));
    const r = run(['make', dir, '--dry-run', '--json']);
    assert.notEqual(r.status, 0);
    const body = JSON.parse(r.stdout);
    assert.equal(body.error.path, 'video.json/lang');
    assert.equal(body.error.rule, 'enum');
  });

  it('init --lang zh-HK writes Traditional Chinese starter', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apexplain-zh-'));
    const dir = path.join(tmp, 'demo');
    const r = run(['init', dir, '--lang', 'zh-HK', '--title', '閏年']);
    assert.equal(r.status, 0, r.stderr);
    const video = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
    assert.equal(video.lang, 'zh-HK');
    assert.equal(video.voice, 'vocello');
    const script = fs.readFileSync(path.join(dir, 'script.md'), 'utf8');
    assert.match(script, /呢條短片/);
  });
});

describe('extractSubject', () => {
  it('strips What is / 點解 prefixes', () => {
    assert.equal(extractSubject('What is a cat?'), 'cat');
    assert.equal(extractSubject('點解有閏年'), '閏年');
    assert.equal(extractSubject('Why leap years exist'), 'leap years');
    assert.equal(extractSubject('How do vaccines work?'), 'vaccines');
  });
});

describe('autogenerate outline', () => {
  it('picks intent from the title', () => {
    assert.equal(detectIntent('What is a cat?'), 'definition');
    assert.equal(detectIntent('How do leap years work?'), 'how');
    assert.equal(detectIntent('點解有閏年'), 'why');
  });

  it('builds topic-sensible beats, not Wikipedia TOC or legacy what/why/how slots', () => {
    const outline = planOutline({
      intent: 'definition',
      topic: 'What is a cat?',
      subject: 'cat',
      lang: 'en',
      facts: {
        pageTitle: 'Cat',
        sections: ['Etymology', 'Taxonomy', 'Biology', 'Behavior', 'References', 'See also'],
        sentences: ['The cat is a domestic animal.'],
      },
    });
    const ids = outline.map((b) => b.id);
    const headings = outline.map((b) => b.heading).join(' | ');
    assert.equal(ids[0], 'open');
    assert.equal(ids[ids.length - 1], 'close');
    // Explainer-shaped, about the subject — not Etymology/Taxonomy.
    assert.match(headings, /what a cat is|makes a cat distinct|meet a cat/i);
    assert.ok(!/etymolog|taxonom/i.test(headings));
    assert.ok(!ids.includes('example'));
  });

  it('maps layouts like explainroo picture relationships', () => {
    assert.equal(sceneRelation('how', 'how it works'), 'order');
    assert.equal(layoutFor('how', 'How it works'), 'steps');
    assert.equal(sceneRelation('compare', 'side by side'), 'comparison');
    assert.equal(layoutFor('compare', 'Side by side'), 'compare');
    assert.equal(sceneRelation('definition', 'taxonomy'), 'parts');
    assert.equal(layoutFor('definition', 'Taxonomy'), 'cards');
    assert.equal(sceneRelation('why', 'the cause'), 'cause');
    assert.equal(layoutFor('why', 'The cause'), 'flow');
    assert.equal(sceneRelation('topic', '1000000 requests'), 'number');
    assert.equal(layoutFor('topic', '1000000 requests'), 'title');
  });

  it('keeps scene labels as complete phrases, never mid-word ellipsis', () => {
    const label = shortLabel(
      'The dog is a domesticated descendant of wolves, also called the domestic dog.',
      48,
      { maxWords: 7 },
    );
    assert.equal(label, 'The dog is a domesticated descendant');
    assert.ok(!label.includes('…'));
    assert.equal(shortLabel('Anatomy and physiology', 40), 'Anatomy and physiology');
    const zh = shortLabel('狗係由狼馴化嚟嘅家畜動物，又叫家犬。', 14, { zh: true });
    assert.ok(!zh.includes('…'));
    assert.ok(zh.length <= 14);
  });

  it('converts Simplified Wikipedia copy to Traditional HK', () => {
    assert.equal(toTradHk('闰年，拥有366天。该年有闰日。'), '閏年，擁有366天。該年有閏日。');
    assert.equal(toTradHk('什么是猫'), '什麼是貓');
    const spoken = zhHkCopy('这是闰年');
    assert.match(spoken, /閏年/);
    assert.ok(!/[这闰猫]/.test(spoken));
  });

  it('writes English subject-named stubs when APEXPLAIN_LLM=mock', async () => {
    const prev = process.env.APEXPLAIN_LLM;
    process.env.APEXPLAIN_LLM = 'mock';
    try {
      const stub = await generateExplainer({ title: 'Why leap years exist', lang: 'en' });
      assert.match(stub.script, /leap years/i);
      assert.equal(stub.source, 'fallback');
      assert.ok(!/etymolog|taxonom|notice how it connects/i.test(stub.script));
      assert.ok(!/Why leap years exist exists/i.test(stub.script));
      assert.match(stub.outline.map((b) => b.heading).join(' '), /why leap years happens|seems odd/i);
    } finally {
      if (prev == null) delete process.env.APEXPLAIN_LLM;
      else process.env.APEXPLAIN_LLM = prev;
    }
  });

  it('asks the LLM backend for on-topic copy (injected complete)', async () => {
    const g = await generateExplainer({
      title: 'What is a cat?',
      lang: 'en',
      complete: async () =>
        JSON.stringify({
          script:
            '# Cat\n\n## open\n[#hook] A cat is a small domestic mammal. [#angle] People keep cats as pets.\n\n## close {hold=1}\n[#close] Cats are companions. [#thanks] Thanks for watching.\n',
          scenes: {
            open: { layout: 'title', title: 'Cat', subtitle: 'Domestic mammal' },
            close: { layout: 'title', title: 'Companions', subtitle: 'Thanks' },
          },
        }),
    });
    assert.equal(g.intent, 'definition');
    assert.equal(g.source, 'injected');
    assert.match(g.script, /cat/i);
    assert.ok(!/etymology and naming|taxonomy/i.test(g.script));
  });
});

describe('Chinese script / wrap', () => {
  it('splits sentences on 。', () => {
    const script = parseScript(`# t\n\n## a\n第一句。第二句！第三句？\n`);
    assert.equal(script.scenes[0].sentenceCount, 3);
    const chunks = speechChunks(script.scenes[0].units, { splitOnMarks: true });
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].text, '第一句。');
  });

  it('does not emit a bare 。 chunk after English ?', () => {
    const script = parseScript(`# t\n\n## a\n講What is a cat?。跟住第二句。\n`);
    const chunks = speechChunks(script.scenes[0].units);
    assert.ok(chunks.every((c) => /[\p{L}\p{N}]/u.test(c.text)));
    assert.equal(chunks[0].text, '講What is a cat?。');
  });

  it('wraps Traditional Chinese without spaces', () => {
    const canvas = createCanvas(400, 200);
    const ctx = canvas.getContext('2d');
    ctx.font = '24px sans-serif';
    const lines = wrapText(ctx, '這是一段沒有空白的繁體中文用來測試換行行為是否正常運作', 120);
    assert.ok(lines.length > 1);
  });
});

describe('zh-HK mock make', () => {
  it('writes MP4 for zh-HK starter under mock TTS', async () => {
    process.env.APEXPLAIN_TTS = 'mock';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apexplain-zhmake-'));
    const dir = path.join(tmp, 'demo');
    assert.equal(run(['init', dir, '--lang', 'zh-HK', '--title', '測試']).status, 0);
    const videoPath = path.join(dir, 'video.json');
    const video = JSON.parse(fs.readFileSync(videoPath, 'utf8'));
    video.fps = 10;
    fs.writeFileSync(videoPath, JSON.stringify(video, null, 2));

    // Ensure project loads.
    loadProject(dir);

    const result = await makeFull(dir, { draft: true, log: () => {} });
    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(result.out));
    assert.ok(fs.statSync(result.out).size > 1000);
  });
});

describe('optional real Vocello', () => {
  it('probes Vocello when APEXPLAIN_VOCELLO=1', async (t) => {
    if (process.env.APEXPLAIN_VOCELLO_TEST !== '1') {
      t.skip('set APEXPLAIN_VOCELLO_TEST=1 after npm run setup:vocello');
      return;
    }
    const { probeVocello, createVocelloWorker } = await import('../src/tts/vocello.js');
    const probe = probeVocello();
    assert.equal(probe.ok, true, probe.detail);
    const w = createVocelloWorker({ log: () => {} });
    const audio = await w.generate('多謝晒。');
    assert.ok(audio.audio.length > 1000);
    await w.close();
  });
});
