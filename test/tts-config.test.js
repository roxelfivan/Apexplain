import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  DEFAULT_VOCELLO_BRIEF,
  loadTtsSettings,
  normalizeTtsSettings,
  publicTtsSettings,
  saveTtsSettings,
  ttsCacheFingerprint,
} from '../src/tts/config.js';
import { vocelloDesignArgvForTests as designArgv } from '../src/tts/vocello.js';

const prevConfig = process.env.APEXPLAIN_CONFIG;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apexplain-tts-'));

before(() => {
  process.env.APEXPLAIN_CONFIG = tmp;
  delete process.env.APEXPLAIN_VOCELLO_BRIEF;
  delete process.env.APEXPLAIN_VOCELLO_SEED;
  delete process.env.APEXPLAIN_VOCELLO_DELIVERY;
  delete process.env.APEXPLAIN_VOCELLO_LANGUAGE;
  delete process.env.APEXPLAIN_KOKORO_VOICE;
  delete process.env.APEXPLAIN_KOKORO_SPEED;
});

after(() => {
  if (prevConfig == null) delete process.env.APEXPLAIN_CONFIG;
  else process.env.APEXPLAIN_CONFIG = prevConfig;
});

describe('tts settings', () => {
  it('defaults to Cantonese-locked brief and seed 42', () => {
    const cfg = loadTtsSettings();
    assert.equal(cfg.vocello.seed, 42);
    assert.equal(cfg.vocello.language, 'chinese');
    assert.match(cfg.vocello.voiceBrief, /粵語|Cantonese/);
    assert.equal(cfg.kokoro.voice, 'af_heart');
    assert.ok(publicTtsSettings(cfg).kokoroVoices.includes('af_heart'));
  });

  it('saves and reloads tts.json at 0600', () => {
    const saved = saveTtsSettings({
      vocello: {
        voiceBrief: 'Female HK Cantonese narrator, 粵語 only',
        seed: 99,
        delivery: 'Calm',
        language: 'chinese',
      },
      kokoro: { voice: 'am_michael', speed: 1.1 },
    });
    assert.equal(saved.vocello.seed, 99);
    assert.equal(saved.kokoro.voice, 'am_michael');
    const file = path.join(tmp, 'tts.json');
    assert.ok(fs.existsSync(file));
    const mode = fs.statSync(file).mode & 0o777;
    assert.equal(mode, 0o600);
    const again = loadTtsSettings();
    assert.equal(again.vocello.seed, 99);
    assert.equal(again.kokoro.voice, 'am_michael');
  });

  it('env overrides win over file', () => {
    process.env.APEXPLAIN_VOCELLO_SEED = '7';
    process.env.APEXPLAIN_VOCELLO_BRIEF = 'Env brief 粵語';
    try {
      const cfg = loadTtsSettings();
      assert.equal(cfg.vocello.seed, 7);
      assert.equal(cfg.vocello.voiceBrief, 'Env brief 粵語');
    } finally {
      delete process.env.APEXPLAIN_VOCELLO_SEED;
      delete process.env.APEXPLAIN_VOCELLO_BRIEF;
    }
  });

  it('fingerprint changes when seed changes', () => {
    const a = ttsCacheFingerprint(normalizeTtsSettings({ vocello: { seed: 1 } }));
    const b = ttsCacheFingerprint(normalizeTtsSettings({ vocello: { seed: 2 } }));
    assert.notEqual(a.vocelloSeed, b.vocelloSeed);
  });
});

describe('vocello design argv', () => {
  it('includes seed, brief, language, and delivery', () => {
    const args = designArgv({
      text: '你好',
      out: '/tmp/x.wav',
      brief: DEFAULT_VOCELLO_BRIEF,
      language: 'chinese',
      seed: 42,
      delivery: '粵語 only',
    });
    assert.ok(args.includes('--seed'));
    assert.equal(args[args.indexOf('--seed') + 1], '42');
    assert.ok(args.includes('--voice-brief'));
    assert.ok(args.includes('--delivery'));
    assert.equal(args[args.indexOf('--language') + 1], 'chinese');
  });
});
