/**
 * Local web UI for Apexplain (default http://127.0.0.1:3847).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApexError } from '../errors.js';
import { doctor } from '../doctor.js';
import { generateExplainer, slugifyName } from '../generate.js';
import { initProject } from '../init.js';
import { llmReady } from '../llm/complete.js';
import { LLM_PROVIDERS, publicLlmSettings, saveLlmSettings } from '../llm/config.js';
import { loadGemma, probeGemma } from '../llm/gemma.js';
import { make } from '../make.js';
import {
  clearKokoro,
  clearVocello,
  exportKokoro,
  exportVocello,
  importKokoro,
  importVocello,
  modelsSnapshot,
  setupKokoro,
  setupVocello,
} from '../model-manager.js';
import { packageVersion, projectPaths, ROOT } from '../paths.js';
import { loadProject } from '../project.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, 'public');

function videosRoot() {
  return process.env.APEXPLAIN_VIDEOS || path.join(ROOT, 'videos');
}

function safeProjectName(name) {
  if (!name || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name)) {
    throw new ApexError('project name must be letters, numbers, _ or -', {
      code: 'bad_name',
      path: 'name',
      rule: 'pattern',
    });
  }
  return name;
}

function projectDir(name) {
  const n = safeProjectName(name);
  const dir = path.resolve(videosRoot(), n);
  const root = path.resolve(videosRoot());
  if (!dir.startsWith(root + path.sep) && dir !== root) {
    throw new ApexError('invalid project path', { code: 'bad_path', rule: 'path' });
  }
  return dir;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new ApexError(`bad JSON body: ${e.message}`, { code: 'bad_json', rule: 'json' }));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(text);
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.mp4')) return 'video/mp4';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function listProjects() {
  const root = videosRoot();
  fs.mkdirSync(root, { recursive: true });
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const dir = path.join(root, d.name);
      const paths = projectPaths(dir);
      let title = d.name;
      let lang = 'en';
      let hasVideo = false;
      try {
        if (fs.existsSync(paths.video)) {
          const v = JSON.parse(fs.readFileSync(paths.video, 'utf8'));
          title = v.title || title;
          lang = v.lang || 'en';
        }
        hasVideo = fs.existsSync(paths.outVideo);
      } catch {
        /* ignore */
      }
      return { name: d.name, title, lang, hasVideo };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function startSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (res.socket) res.socket.setNoDelay(true);
  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const log = async (line) => {
    send('log', { line: String(line) });
    await new Promise((r) => setImmediate(r));
  };
  log.update = (msg) => {
    send('progress', { line: String(msg) });
  };
  return { send, log };
}

async function streamApiJob(res, fn) {
  const { send, log } = startSse(res);
  send('status', { state: 'started' });
  try {
    const result = await fn(log);
    send('status', { state: 'done' });
    send('done', { ok: true, result: result || null, models: modelsSnapshot() });
  } catch (err) {
    send('status', { state: 'error' });
    send('error', {
      message: err.message,
      path: err.path,
      rule: err.rule,
      hint: err.hint,
      code: err.code,
    });
  }
  res.end();
}

async function handleApi(req, res, url) {
  try {
    if (req.method === 'GET' && url.pathname === '/api/meta') {
      return sendJson(res, 200, {
        ok: true,
        version: packageVersion(),
        videosRoot: videosRoot(),
        doctor: doctor({ lang: 'en' }),
        doctorZh: doctor({ lang: 'zh-HK' }),
        llm: { ...publicLlmSettings(), ready: llmReady(), gemma: probeGemma() },
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/models') {
      return sendJson(res, 200, modelsSnapshot());
    }

    if (req.method === 'POST' && url.pathname === '/api/models/kokoro/setup') {
      return streamApiJob(res, (log) => setupKokoro({ log }));
    }
    if (req.method === 'POST' && url.pathname === '/api/models/vocello/setup') {
      return streamApiJob(res, (log) => setupVocello({ log }));
    }
    if (req.method === 'POST' && url.pathname === '/api/models/kokoro/clear') {
      return sendJson(res, 200, { ok: true, probe: clearKokoro(), models: modelsSnapshot() });
    }
    if (req.method === 'POST' && url.pathname === '/api/models/vocello/clear') {
      return streamApiJob(res, (log) => clearVocello({ log }));
    }

    const modelIo = url.pathname.match(/^\/api\/models\/(kokoro|vocello)\/(export|import)$/);
    if (modelIo && req.method === 'POST') {
      const [, engine, action] = modelIo;
      const body = await readBody(req);
      const dest = body.path;
      let lastSave;
      let probe;
      if (engine === 'kokoro' && action === 'export') lastSave = exportKokoro(dest);
      else if (engine === 'kokoro' && action === 'import') probe = importKokoro(dest);
      else if (engine === 'vocello' && action === 'export') lastSave = exportVocello(dest);
      else probe = importVocello(dest);
      return sendJson(res, 200, {
        ok: true,
        lastSave: lastSave || null,
        probe: probe || null,
        models: modelsSnapshot(),
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/settings') {
      return sendJson(res, 200, {
        ok: true,
        ...publicLlmSettings(),
        providers: LLM_PROVIDERS.map((p) => ({
          id: p.id,
          label: p.label,
          requiresApiKey: p.requiresApiKey,
          defaultEndpoint: p.defaultEndpoint,
          defaultModel: p.defaultModel,
          modelPresets: p.modelPresets,
          helpText: p.helpText,
          apiKeyPlaceholder: p.apiKeyPlaceholder,
        })),
        ready: llmReady(),
        gemma: probeGemma(),
      });
    }

    if (req.method === 'PUT' && url.pathname === '/api/settings') {
      const body = await readBody(req);
      const saved = saveLlmSettings({
        provider: body.provider,
        apiEndpoint: body.apiEndpoint,
        model: body.model,
        apiKey: body.apiKey,
        clearApiKey: !!body.clearApiKey,
      });
      return sendJson(res, 200, {
        ok: true,
        ...publicLlmSettings(saved),
        ready: llmReady(saved),
        gemma: probeGemma(),
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/settings/gemma/download') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      if (res.socket) res.socket.setNoDelay(true);
      const send = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      const logLine = async (line) => {
        send('log', { line: String(line) });
        await new Promise((r) => setImmediate(r));
      };
      send('status', { state: 'started' });
      try {
        await loadGemma({ log: logLine, allowHf: true });
        const gemma = probeGemma();
        send('status', { state: 'done' });
        send('done', { ok: gemma.ok, gemma });
      } catch (err) {
        send('status', { state: 'error' });
        send('error', { message: err.message, path: err.path, rule: err.rule, hint: err.hint });
      }
      res.end();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/projects') {
      return sendJson(res, 200, { ok: true, projects: listProjects(), root: videosRoot() });
    }

    if (req.method === 'POST' && url.pathname === '/api/projects') {
      const body = await readBody(req);
      const title = (body.title || '').trim() || body.name;
      let name = (body.name || '').trim() || slugifyName(title);
      try {
        name = safeProjectName(name);
      } catch (e) {
        const fixed = slugifyName(name || title);
        throw new ApexError(
          `project name must be letters, numbers, _ or - (try "${fixed}")`,
          { code: 'bad_name', path: 'name', rule: 'pattern', hint: `Use folder name: ${fixed}` },
        );
      }
      const dir = projectDir(name);
      const result = initProject(dir, {
        title: title || name,
        lang: body.lang || 'en',
        size: body.size || '16:9',
        theme: body.theme || 'studio',
      });
      return sendJson(res, 200, { ...result, name });
    }

    const deleteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
      const name = decodeURIComponent(deleteMatch[1]);
      const dir = projectDir(name);
      if (!fs.existsSync(dir)) {
        throw new ApexError(`project not found: ${name}`, {
          code: 'missing_project',
          path: name,
          rule: 'exists',
        });
      }
      fs.rmSync(dir, { recursive: true, force: true });
      return sendJson(res, 200, { ok: true, removed: name });
    }

    const generateMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/generate$/);
    if (generateMatch && req.method === 'POST') {
      const dir = projectDir(decodeURIComponent(generateMatch[1]));
      const paths = projectPaths(dir);
      const body = await readBody(req);
      const video = JSON.parse(fs.readFileSync(paths.video, 'utf8'));
      const title = (body.title || video.title || path.basename(dir)).trim();
      const lang = body.lang || video.lang || 'en';
      video.title = title;
      video.lang = lang;
      if (lang === 'zh-HK') video.voice = video.voice || 'vocello';
      const logs = [];
      const { script, scenes, source, subject, outline, intent } = await generateExplainer({
        title,
        lang,
        log: (line) => logs.push(String(line)),
      });
      const videoText = JSON.stringify(video, null, 2) + '\n';
      const scenesText = JSON.stringify(scenes, null, 2) + '\n';
      fs.writeFileSync(paths.video, videoText);
      fs.writeFileSync(paths.script, script.endsWith('\n') ? script : script + '\n');
      fs.writeFileSync(paths.scenes, scenesText);
      loadProject(dir);
      return sendJson(res, 200, {
        ok: true,
        video: videoText,
        script,
        scenes: scenesText,
        source: source || null,
        subject: subject || null,
        intent: intent || null,
        outline: Array.isArray(outline) ? outline.map((b) => b.heading) : null,
        llm: source || null,
        logs,
      });
    }

    const fileMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/files$/);
    if (fileMatch && req.method === 'GET') {
      const dir = projectDir(decodeURIComponent(fileMatch[1]));
      const paths = projectPaths(dir);
      return sendJson(res, 200, {
        ok: true,
        name: path.basename(dir),
        video: fs.readFileSync(paths.video, 'utf8'),
        script: fs.readFileSync(paths.script, 'utf8'),
        scenes: fs.readFileSync(paths.scenes, 'utf8'),
        hasVideo: fs.existsSync(paths.outVideo),
      });
    }

    if (fileMatch && req.method === 'PUT') {
      const dir = projectDir(decodeURIComponent(fileMatch[1]));
      const paths = projectPaths(dir);
      const body = await readBody(req);
      if (body.video != null) {
        JSON.parse(body.video);
        fs.writeFileSync(paths.video, body.video.endsWith('\n') ? body.video : body.video + '\n');
      }
      if (body.script != null) {
        fs.writeFileSync(paths.script, body.script.endsWith('\n') ? body.script : body.script + '\n');
      }
      if (body.scenes != null) {
        JSON.parse(body.scenes);
        fs.writeFileSync(paths.scenes, body.scenes.endsWith('\n') ? body.scenes : body.scenes + '\n');
      }
      // Validate after write.
      loadProject(dir);
      return sendJson(res, 200, { ok: true });
    }

    const makeMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/make$/);
    if (makeMatch && req.method === 'POST') {
      const dir = projectDir(decodeURIComponent(makeMatch[1]));
      const body = await readBody(req);
      const logs = [];
      const result = await make(dir, {
        dryRun: !!body.dryRun,
        estimate: !!body.estimate,
        voiceOnly: !!body.voiceOnly,
        draft: body.draft !== false,
        force: !!body.force,
      });
      // makeFull uses its own log to stderr; capture message only.
      return sendJson(res, 200, { ...result, logs });
    }

    // Streaming make with SSE log lines.
    const makeStream = url.pathname.match(/^\/api\/projects\/([^/]+)\/make-stream$/);
    if (makeStream && req.method === 'POST') {
      const dir = projectDir(decodeURIComponent(makeStream[1]));
      const body = await readBody(req);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      if (res.socket) res.socket.setNoDelay(true);
      const send = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      // Flush after each log so zh-HK Vocello chunks appear one-by-one like English.
      const logLine = async (line) => {
        send('log', { line: String(line) });
        await new Promise((r) => setImmediate(r));
      };
      send('status', { state: 'started', dryRun: !!body.dryRun });
      try {
        const result = await make(dir, {
          dryRun: !!body.dryRun,
          voiceOnly: !!body.voiceOnly,
          draft: body.draft !== false,
          force: !!body.force,
          log: logLine,
        });
        send('status', { state: 'done' });
        send('done', result);
      } catch (err) {
        send('status', { state: 'error' });
        send('error', {
          message: err.message,
          path: err.path,
          rule: err.rule,
          hint: err.hint,
          code: err.code,
        });
      }
      res.end();
      return;
    }

    const videoMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/video\.mp4$/);
    if (videoMatch && req.method === 'GET') {
      const dir = projectDir(decodeURIComponent(videoMatch[1]));
      const file = projectPaths(dir).outVideo;
      if (!fs.existsSync(file)) {
        return sendJson(res, 404, { ok: false, error: 'no video yet — run Make first' });
      }
      const stat = fs.statSync(file);
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(file).pipe(res);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    const status = err.code === 'dir_not_empty' || err.code === 'bad_flag' ? 400 : 500;
    sendJson(res, status, {
      ok: false,
      error: err.message,
      path: err.path,
      rule: err.rule,
      hint: err.hint,
      code: err.code,
    });
  }
}

function serveStatic(req, res, url) {
  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    sendText(res, 404, 'Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': contentType(file) });
  fs.createReadStream(file).pipe(res);
}

/**
 * Start the UI server. Does not exit — keeps the process alive.
 */
export function startUi({ port = 3847, host = '127.0.0.1' } = {}) {
  fs.mkdirSync(videosRoot(), { recursive: true });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${host}:${port}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  });

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const bound = server.address();
      const actualPort = typeof bound === 'object' && bound ? bound.port : port;
      const addr = `http://${host}:${actualPort}`;
      process.stdout.write(
        `apexplain ui ${packageVersion()}\n` +
          `open ${addr}\n` +
          `projects folder: ${videosRoot()}\n` +
          `press Ctrl+C to stop\n`,
      );
      resolve({ server, url: addr, port: actualPort });
    });
    server.on('error', reject);
  });
}
