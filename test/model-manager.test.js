import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apexplain-models-'));
const cache = path.join(tmp, 'cache');
const vocelloModels = path.join(tmp, 'qwen-models');
process.env.APEXPLAIN_CACHE = cache;
process.env.APEXPLAIN_VOCELLO_MODELS = vocelloModels;

const {
  assertKokoroLayout,
  clearKokoro,
  dirSizeBytes,
  exportKokoro,
  exportVocello,
  findVocelloLayout,
  importKokoro,
  importVocello,
  modelsSnapshot,
  resolveUserPath,
} = await import('../src/model-manager.js');
const { kokoroModelDir } = await import('../src/models.js');
const { VOCELLO_DESIGN_MODEL } = await import('../src/tts/vocello.js');

function writeKokoroTree(dir) {
  fs.mkdirSync(path.join(dir, 'onnx'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tokenizer.json'), '{"ok":true}\n');
  fs.writeFileSync(path.join(dir, 'onnx', 'model_quantized.onnx'), 'fake-onnx');
}

describe('model-manager', () => {
  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('resolves ~ and rejects empty paths', () => {
    const home = resolveUserPath('~/apexplain-test-path');
    assert.equal(home, path.join(os.homedir(), 'apexplain-test-path'));
    assert.throws(() => resolveUserPath(''), /required/);
  });

  it('validates Kokoro layout and copies import/export without Hugging Face', () => {
    const src = path.join(tmp, 'kokoro-src');
    writeKokoroTree(src);
    assert.equal(assertKokoroLayout(src), src);

    const nested = path.join(tmp, 'nested');
    writeKokoroTree(path.join(nested, 'onnx-community', 'Kokoro-82M-v1.0-ONNX'));
    assert.match(assertKokoroLayout(nested), /Kokoro-82M-v1.0-ONNX$/);

    importKokoro(src);
    const destCache = kokoroModelDir();
    assert.ok(fs.existsSync(path.join(destCache, 'onnx', 'model_quantized.onnx')));

    const out = path.join(tmp, 'kokoro-export');
    const saved = exportKokoro(out);
    assert.equal(saved.path, out);
    assert.ok(fs.existsSync(path.join(out, 'tokenizer.json')));

    clearKokoro();
    assert.equal(fs.existsSync(destCache), false);
    const snap = modelsSnapshot();
    assert.equal(snap.kokoro.lastSave.fileName, 'kokoro-export');
  });

  it('validates Vocello layout by size and copies a local folder', () => {
    const src = path.join(tmp, 'pro_design_speed');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'weights.bin'), Buffer.alloc(1024 * 1024 + 8, 1));
    assert.equal(findVocelloLayout(src), src);
    assert.ok(dirSizeBytes(src) > 1024 * 1024);

    const parent = path.join(tmp, 'vocello-parent');
    fs.mkdirSync(path.join(parent, VOCELLO_DESIGN_MODEL), { recursive: true });
    fs.writeFileSync(
      path.join(parent, VOCELLO_DESIGN_MODEL, 'weights.bin'),
      Buffer.alloc(1024 * 1024 + 8, 2),
    );
    assert.equal(findVocelloLayout(parent), path.join(parent, VOCELLO_DESIGN_MODEL));

    const probe = importVocello(src);
    assert.ok(probe.imported);
    assert.ok(fs.existsSync(path.join(vocelloModels, VOCELLO_DESIGN_MODEL, 'weights.bin')));

    const exported = path.join(tmp, 'vocello-export');
    exportVocello(exported);
    assert.ok(dirSizeBytes(exported) > 1024 * 1024);
  });
});
