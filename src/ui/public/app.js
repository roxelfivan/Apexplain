const $ = (id) => document.getElementById(id);

let current = null;

function slugify(input) {
  const s = String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 48);
  return s;
}

function showCreateError(msg) {
  const el = $('createError');
  if (!msg) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.textContent = msg;
  el.classList.remove('hidden');
}

function setOutputStatus(text, cls = '') {
  const el = $('outputStatus');
  if (!el) return;
  el.textContent = text;
  el.className = `output-status${cls ? ` ${cls}` : ' muted'}`;
}

function revealOutput() {
  const out = $('output');
  if (out) out.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function log(msg, cls = '') {
  const el = $('log');
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2);
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function clearLog() {
  $('log').textContent = '';
}

function refreshPlayer(hasVideo) {
  const player = $('player');
  if (!current || !hasVideo) {
    player.removeAttribute('src');
    player.classList.remove('visible');
    return;
  }
  player.src = `/api/projects/${encodeURIComponent(current)}/video.mp4?t=${Date.now()}`;
  player.classList.add('visible');
  player.load();
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { ok: false, error: text };
  }
  if (!res.ok || body.ok === false) {
    const err = new Error(body.error || res.statusText || 'request failed');
    err.body = body;
    throw err;
  }
  return body;
}

async function refreshMeta() {
  const meta = await api('/api/meta');
  $('version').textContent = `v${meta.version}`;
}

async function refreshProjects() {
  const data = await api('/api/projects');
  const list = $('projectList');
  list.innerHTML = '';
  if (!data.projects.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No projects yet';
    list.appendChild(li);
    return;
  }
  for (const p of data.projects) {
    const li = document.createElement('li');
    li.className = 'project-row';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'project-open';
    btn.innerHTML = `<span class="name">${escapeHtml(p.name)}</span><span class="meta">${escapeHtml(
      p.title,
    )} · ${escapeHtml(p.lang)}${p.hasVideo ? ' · mp4' : ''}</span>`;
    if (current === p.name) btn.classList.add('active');
    btn.addEventListener('click', () => openProject(p.name));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'project-delete';
    del.title = `Remove ${p.name}`;
    del.setAttribute('aria-label', `Remove ${p.name}`);
    del.textContent = '×';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      removeProject(p.name);
    });

    li.appendChild(btn);
    li.appendChild(del);
    list.appendChild(li);
  }
}

async function removeProject(name) {
  const ok = window.confirm(
    `Remove project “${name}”?\n\nThis deletes the folder under videos/ and cannot be undone.`,
  );
  if (!ok) return;
  try {
    await api(`/api/projects/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (current === name) {
      current = null;
      $('editor').classList.add('hidden');
      $('empty').classList.remove('hidden');
      refreshPlayer(false);
      clearLog();
      setOutputStatus('idle');
    }
    await refreshProjects();
  } catch (e) {
    window.alert(e.message || 'Remove failed');
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function setTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('active', p.dataset.panel === name);
  });
}

async function openProject(name) {
  current = name;
  const data = await api(`/api/projects/${encodeURIComponent(name)}/files`);
  $('empty').classList.add('hidden');
  $('editor').classList.remove('hidden');
  $('projectTitle').textContent = name;
  let lang = 'en';
  try {
    lang = JSON.parse(data.video).lang || 'en';
  } catch {
    /* ignore */
  }
  $('projectMeta').textContent = `lang=${lang} · click tabs to edit files`;
  $('videoEditor').value = data.video;
  $('scriptEditor').value = data.script;
  $('scenesEditor').value = data.scenes;
  setTab('script');
  clearLog();
  setOutputStatus(data.hasVideo ? 'ready' : 'idle', data.hasVideo ? 'ok' : '');
  log(`Opened ${name}. Edit the tabs, Save, then Make video.`);
  refreshPlayer(!!data.hasVideo);
  revealOutput();
  await refreshProjects();
}

async function createProject() {
  showCreateError('');
  const title = $('newTitle').value.trim();
  let name = $('newName').value.trim();
  if (!title && !name) {
    showCreateError('Enter a title (or a folder name).');
    $('newTitle').focus();
    return;
  }
  if (!name) name = slugify(title);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name)) {
    const fixed = slugify(name || title);
    showCreateError(
      `Folder name "${name}" is invalid (no spaces). Try "${fixed}" — leave Folder name blank to auto-fill.`,
    );
    $('newName').value = fixed;
    return;
  }

  $('createBtn').disabled = true;
  try {
    await api('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name,
        title: title || name,
        lang: $('newLang').value,
        size: $('newSize').value,
      }),
    });
    $('newName').value = '';
    $('newTitle').value = '';
    await refreshProjects();
    await openProject(name);
  } catch (e) {
    const hint = e.body?.hint ? ` ${e.body.hint}` : '';
    showCreateError((e.message || 'Create failed') + hint);
  } finally {
    $('createBtn').disabled = false;
  }
}

async function saveProject() {
  if (!current) return;
  await api(`/api/projects/${encodeURIComponent(current)}/files`, {
    method: 'PUT',
    body: JSON.stringify({
      video: $('videoEditor').value,
      script: $('scriptEditor').value,
      scenes: $('scenesEditor').value,
    }),
  });
  setOutputStatus('saved', 'ok');
  log('saved', 'ok');
  revealOutput();
  try {
    const lang = JSON.parse($('videoEditor').value).lang || 'en';
    $('projectMeta').textContent = `lang=${lang} · click tabs to edit files`;
  } catch {
    /* ignore */
  }
}

async function autogenerate() {
  if (!current) return;
  clearLog();
  setOutputStatus('generating…', 'busy');
  revealOutput();
  log('Autogenerating a topic-shaped ~1 min script (Wikipedia when online)…');
  try {
    let video;
    try {
      video = JSON.parse($('videoEditor').value);
    } catch {
      throw new Error('video.json is not valid JSON — fix it in the video.json tab first');
    }
    const title = video.title || current;
    const lang = video.lang || 'en';
    const data = await api(`/api/projects/${encodeURIComponent(current)}/generate`, {
      method: 'POST',
      body: JSON.stringify({ title, lang }),
    });
    $('videoEditor').value = data.video;
    $('scriptEditor').value = data.script;
    $('scenesEditor').value = data.scenes;
    setTab('script');
    const src =
      data.source && data.source !== 'fallback'
        ? ` from ${data.source}`
        : ' (topic stub — offline or no Wikipedia hit)';
    const subj = data.subject ? ` about “${data.subject}”` : '';
    const shape =
      Array.isArray(data.outline) && data.outline.length
        ? ` · outline ${data.outline.join(' → ')}`
        : '';
    setOutputStatus('generated', 'ok');
    log(`Autogenerated${subj}${src}${shape}. Review script.md, then Make video.`, 'ok');
    revealOutput();
  } catch (e) {
    setOutputStatus('error', 'err');
    log(e.message || 'generate failed', 'err');
    revealOutput();
  }
}

async function runMake({ dryRun = false } = {}) {
  if (!current) return;
  await saveProject();
  clearLog();
  setOutputStatus(dryRun ? 'dry-run…' : 'making…', 'busy');
  revealOutput();
  log(dryRun ? 'dry-run…' : 'make… (this can take a while)');
  $('makeBtn').disabled = true;
  $('dryBtn').disabled = true;
  $('generateBtn').disabled = true;
  try {
    const result = await runMakeStream({ dryRun });
    if (result.out) refreshPlayer(true);
    setOutputStatus(dryRun ? 'dry-run ok' : 'ready', 'ok');
    const summary = String(result.message || '')
      .split('\n')
      .filter((l) => /^(ok:|video:)/.test(l))
      .join('\n');
    log(summary || (dryRun ? 'dry-run complete' : 'done'), 'ok');
    revealOutput();
    await refreshProjects();
  } catch (err) {
    const b = err.body || {};
    setOutputStatus('error', 'err');
    log(
      [err.message, b.path && `path: ${b.path}`, b.rule && `rule: ${b.rule}`, b.hint && `hint: ${b.hint}`]
        .filter(Boolean)
        .join('\n'),
      'err',
    );
    revealOutput();
  } finally {
    $('makeBtn').disabled = false;
    $('dryBtn').disabled = false;
    $('generateBtn').disabled = false;
  }
}

function runMakeStream({ dryRun }) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(current)}/make-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun, draft: true }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text();
        try {
          const body = JSON.parse(text);
          reject(Object.assign(new Error(body.error), { body }));
        } catch {
          reject(new Error(text || res.statusText));
        }
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let donePayload = null;
      let errPayload = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const lines = part.split('\n');
          let event = 'message';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;
          let payload;
          try {
            payload = JSON.parse(data);
          } catch {
            continue;
          }
          if (event === 'status') {
            const state = payload.state;
            if (state === 'started') {
              setOutputStatus(payload.dryRun ? 'dry-run…' : 'making…', 'busy');
            } else if (state === 'done') {
              setOutputStatus(dryRun ? 'dry-run ok' : 'ready', 'ok');
            } else if (state === 'error') {
              setOutputStatus('error', 'err');
            }
            revealOutput();
          } else if (event === 'log') {
            log(payload.line || '');
            setOutputStatus(dryRun ? 'dry-run…' : 'making…', 'busy');
          } else if (event === 'done') {
            donePayload = payload;
          } else if (event === 'error') {
            errPayload = payload;
          }
        }
      }
      if (errPayload) {
        const err = new Error(errPayload.message || 'make failed');
        err.body = errPayload;
        reject(err);
        return;
      }
      resolve(donePayload || { ok: true, message: 'done' });
    } catch (e) {
      reject(e);
    }
  });
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => setTab(tab.dataset.tab));
});

$('newTitle').addEventListener('input', () => {
  if (!$('newName').value.trim()) {
    $('newName').placeholder = slugify($('newTitle').value) || 'auto from title';
  }
});

$('createBtn').addEventListener('click', () => createProject());
$('saveBtn').addEventListener('click', () => saveProject().catch((e) => log(e.message, 'err')));
$('generateBtn').addEventListener('click', () => autogenerate());
$('dryBtn').addEventListener('click', () => runMake({ dryRun: true }));
$('makeBtn').addEventListener('click', () => runMake({ dryRun: false }));

function formatSaved(last) {
  if (!last) return 'Not saved to disk yet.';
  let when = '';
  try {
    when = new Date(last.savedAt).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    when = last.savedAt ? String(last.savedAt) : '';
  }
  const name = last.fileName || last.path || 'copy';
  return when ? `${name} · ${when}` : name;
}

function kokoroStatusText(k) {
  if (!k) return 'checking…';
  if (k.ok) return 'Ready';
  return 'Not downloaded';
}

function vocelloStatusText(v) {
  if (!v) return 'checking…';
  if (v.ok) return 'Ready';
  if (!v.bin) return 'CLI missing';
  return 'Not downloaded';
}

function setEngineError(engine, msg) {
  const el = document.querySelector(`[data-error="${engine}"]`);
  if (!el) return;
  if (!msg) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.textContent = msg;
  el.classList.remove('hidden');
}

function appendJobLog(engine, line) {
  const box = document.querySelector(`[data-progress="${engine}"]`);
  const logEl = document.querySelector(`[data-log="${engine}"]`);
  if (box) box.classList.remove('hidden');
  if (logEl && line) {
    logEl.textContent += (logEl.textContent ? '\n' : '') + line;
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function resetJobLog(engine) {
  const box = document.querySelector(`[data-progress="${engine}"]`);
  const logEl = document.querySelector(`[data-log="${engine}"]`);
  if (logEl) logEl.textContent = '';
  if (box) box.classList.add('hidden');
}

function applyModels(models) {
  if (!models) return;
  const cache = document.querySelector('[data-cache-root]');
  if (cache && models.cacheRoot) cache.textContent = models.cacheRoot;

  const k = models.kokoro;
  if (k) {
    const status = document.querySelector('[data-status="kokoro"]');
    if (status) status.textContent = kokoroStatusText(k);
    const last = document.querySelector('[data-lastsave="kokoro"]');
    if (last) last.textContent = formatSaved(k.lastSave);
    const pathEl = document.querySelector('[data-path="kokoro"]');
    if (pathEl) pathEl.textContent = k.dir ? `Cache: ${k.dir}` : '';
    const size = document.querySelector('[data-size="kokoro"]');
    if (size && k.sizeLabel) size.textContent = k.sizeLabel;
  }
  const v = models.vocello;
  if (v) {
    const status = document.querySelector('[data-status="vocello"]');
    if (status) status.textContent = vocelloStatusText(v);
    const last = document.querySelector('[data-lastsave="vocello"]');
    if (last) last.textContent = formatSaved(v.lastSave);
    const pathEl = document.querySelector('[data-path="vocello"]');
    if (pathEl) {
      pathEl.textContent = v.bin
        ? `CLI: ${v.bin}${v.dir ? ` · ${v.dir}` : ''}`
        : 'Install the Vocello CLI from GitHub releases, then download the model.';
    }
    const size = document.querySelector('[data-size="vocello"]');
    if (size && v.sizeLabel) size.textContent = v.sizeLabel;
  }
}

async function refreshModels() {
  const models = await api('/api/models');
  applyModels(models);
  return models;
}

function openSettings() {
  $('settingsOverlay').classList.remove('hidden');
  setEngineError('kokoro', '');
  setEngineError('vocello', '');
  refreshModels().catch((e) => {
    setEngineError('kokoro', e.message);
    setEngineError('vocello', e.message);
  });
}

function closeSettings() {
  $('settingsOverlay').classList.add('hidden');
}

function togglePathField(engine, kind, show) {
  const el = document.querySelector(`[data-pathfield="${engine}-${kind}"]`);
  if (!el) return;
  el.classList.toggle('hidden', !show);
  if (show) {
    const input = document.querySelector(`[data-input="${engine}-${kind}"]`);
    if (input) input.focus();
  }
}

function consumeSseBuffer(buffer, onEvent) {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() || '';
  for (const part of parts) {
    const lines = part.split('\n');
    let event = 'message';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) continue;
    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      continue;
    }
    onEvent(event, payload);
  }
  return rest;
}

async function runModelSse(engine, path) {
  setEngineError(engine, '');
  resetJobLog(engine);
  appendJobLog(engine, 'starting…');
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let errPayload = null;
  let donePayload = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = consumeSseBuffer(buffer, (event, payload) => {
      if (event === 'log' || event === 'progress') {
        appendJobLog(engine, payload.line || '');
      } else if (event === 'done') {
        donePayload = payload;
        if (payload.models) applyModels(payload.models);
      } else if (event === 'error') {
        errPayload = payload;
      }
    });
  }
  if (errPayload) {
    const err = new Error(errPayload.message || 'job failed');
    err.body = errPayload;
    throw err;
  }
  return donePayload || { ok: true };
}

async function postModelPath(engine, action, pathValue) {
  const body = await api(`/api/models/${engine}/${action}`, {
    method: 'POST',
    body: JSON.stringify({ path: pathValue }),
  });
  if (body.models) applyModels(body.models);
  return body;
}

async function submitPathAction(engine, kind) {
  const input = document.querySelector(`[data-input="${engine}-${kind}"]`);
  const pathValue = (input?.value || '').trim();
  if (!pathValue) {
    setEngineError(engine, 'Enter an absolute folder path on this machine.');
    return;
  }
  await postModelPath(engine, kind, pathValue);
  togglePathField(engine, kind, false);
}

function wireSettings() {
  $('settingsBtn').addEventListener('click', () => openSettings());
  $('settingsClose').addEventListener('click', () => closeSettings());
  $('settingsOverlay').addEventListener('click', (e) => {
    if (e.target === $('settingsOverlay')) closeSettings();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === '.') {
      e.preventDefault();
      if ($('settingsOverlay').classList.contains('hidden')) openSettings();
      else closeSettings();
      return;
    }
    if (e.key === 'Escape' && !$('settingsOverlay').classList.contains('hidden')) {
      closeSettings();
    }
  });

  document.querySelectorAll('[data-input]').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const id = input.dataset.input || '';
      const [engine, kind] = id.split('-');
      submitPathAction(engine, kind).catch((err) => {
        const hint = err.body?.hint ? `\n${err.body.hint}` : '';
        setEngineError(engine, (err.message || 'failed') + hint);
      });
    });
  });

  document.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const act = btn.dataset.act;
      const engine = act.startsWith('vocello') ? 'vocello' : 'kokoro';
      btn.disabled = true;
      try {
        if (act === 'kokoro-download' || act === 'vocello-download') {
          await runModelSse(engine, `/api/models/${engine}/setup`);
          return;
        }
        if (act === 'kokoro-clear') {
          const body = await api('/api/models/kokoro/clear', { method: 'POST', body: '{}' });
          if (body.models) applyModels(body.models);
          return;
        }
        if (act === 'vocello-clear') {
          await runModelSse('vocello', '/api/models/vocello/clear');
          return;
        }
        if (act.endsWith('-export') && !act.endsWith('-export-go')) {
          togglePathField(engine, 'export', true);
          return;
        }
        if (act.endsWith('-import') && !act.endsWith('-import-go')) {
          togglePathField(engine, 'import', true);
          return;
        }
        if (act.endsWith('-export-go') || act.endsWith('-import-go')) {
          const kind = act.includes('export') ? 'export' : 'import';
          await submitPathAction(engine, kind);
        }
      } catch (e) {
        const hint = e.body?.hint ? `\n${e.body.hint}` : '';
        setEngineError(engine, (e.message || 'failed') + hint);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

wireSettings();

refreshMeta()
  .then(refreshProjects)
  .catch((e) => {
    $('version').textContent = e.message;
  });
