import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apexplain-ui-models-'));
process.env.APEXPLAIN_CACHE = path.join(tmp, 'cache');
process.env.APEXPLAIN_VOCELLO_MODELS = path.join(tmp, 'qwen-models');
process.env.APEXPLAIN_VIDEOS = path.join(tmp, 'videos');

const { startUi } = await import('../src/ui/server.js');
const { importKokoro } = await import('../src/model-manager.js');

function json(url, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method,
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = { raw: text };
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('UI /api/models', () => {
  let server;
  let base;

  before(async () => {
    const started = await startUi({ port: 0, host: '127.0.0.1' });
    server = started.server;
    base = started.url;
  });

  after(() => {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('GET /api/models does not download weights', async () => {
    const r = await json(`${base}/api/models`);
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.ok(r.body.kokoro);
    assert.ok(r.body.vocello);
    assert.equal(r.body.kokoro.ok, false);
    assert.match(r.body.kokoro.hfPage, /huggingface\.co/);
    assert.match(r.body.vocello.releasesPage, /Vocello\/releases/);
    assert.equal(r.body.vocello.ok, false);
  });

  it('imports a local Kokoro folder via POST', async () => {
    const src = path.join(tmp, 'kokoro-src');
    fs.mkdirSync(path.join(src, 'onnx'), { recursive: true });
    fs.writeFileSync(path.join(src, 'tokenizer.json'), '{}\n');
    fs.writeFileSync(path.join(src, 'onnx', 'model_quantized.onnx'), 'onnx');
    importKokoro(src);

    const exported = path.join(tmp, 'roundtrip');
    const exp = await json(`${base}/api/models/kokoro/export`, {
      method: 'POST',
      body: { path: exported },
    });
    assert.equal(exp.status, 200);
    assert.equal(exp.body.ok, true);
    assert.ok(fs.existsSync(path.join(exported, 'tokenizer.json')));

    const cleared = await json(`${base}/api/models/kokoro/clear`, { method: 'POST', body: {} });
    assert.equal(cleared.body.models.kokoro.ok, false);

    const imp = await json(`${base}/api/models/kokoro/import`, {
      method: 'POST',
      body: { path: exported },
    });
    assert.equal(imp.status, 200);
    assert.equal(imp.body.ok, true);
    assert.ok(imp.body.models.kokoro.onnx.includes('model_quantized.onnx'));
  });

  it('rejects empty export path', async () => {
    const r = await json(`${base}/api/models/kokoro/export`, { method: 'POST', body: { path: '' } });
    assert.equal(r.status, 500);
    assert.match(r.body.error, /path/i);
  });
});
