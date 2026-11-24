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

function clampTargetSeconds(raw) {
  if (raw == null || raw === '') return null;
  // Leftover template fill must not count as a length.
  if (typeof raw === 'string' && /\{\{/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(600, Math.max(15, n)));
}

/**
 * Repair common template leftovers like `"targetSeconds": {{targetSeconds}}`
 * or `"targetSeconds": "{{targetSeconds}}"` from a stale init.
 */
function repairVideoJsonText(text) {
  let s = String(text || '');
  const fromInput = clampTargetSeconds($('targetSeconds')?.value) ?? 60;
  s = s.replace(
    /("targetSeconds"\s*:\s*)"\{\{\s*targetSeconds\s*\}\}"/gi,
    `$1${fromInput}`,
  );
  s = s.replace(
    /("targetSeconds"\s*:\s*)\{\{\s*targetSeconds\s*\}\}/gi,
    `$1${fromInput}`,
  );
  s = s.replace(/\{\{\s*targetSeconds\s*\}\}/gi, String(fromInput));
  // Other leftover {{placeholders}} → empty string so JSON can parse.
  s = s.replace(/\{\{\s*(\w+)\s*\}\}/g, '""');
  return s;
}

/** Coerce video.targetSeconds; rewrite quoted template leftovers into a number. */
function normalizeVideoTargetSeconds(video, fallback = 60) {
  const t = clampTargetSeconds(video?.targetSeconds) ?? fallback;
  if (video && video.targetSeconds !== t) video.targetSeconds = t;
  return t;
}

function parseVideoEditor() {
  const raw = $('videoEditor').value;
  let video;
  try {
    video = JSON.parse(raw);
  } catch {
    const repaired = repairVideoJsonText(raw);
    video = JSON.parse(repaired);
    $('videoEditor').value = JSON.stringify(video, null, 2) + '\n';
  }
  // Quoted "{{targetSeconds}}" parses as JSON but is not a real length — fix in place.
  if (typeof video.targetSeconds === 'string' && /\{\{/.test(video.targetSeconds)) {
    const repaired = repairVideoJsonText(JSON.stringify(video));
    video = JSON.parse(repaired);
    normalizeVideoTargetSeconds(video, clampTargetSeconds($('targetSeconds')?.value) ?? 60);
    $('videoEditor').value = JSON.stringify(video, null, 2) + '\n';
  }
  return video;
}

/** Pull targetSeconds from video.json textarea into the number input. */
function syncTargetSecondsFromEditor() {
  const input = $('targetSeconds');
  if (!input) return;
  try {
    const video = parseVideoEditor();
    const n = clampTargetSeconds(video.targetSeconds);
    if (n != null) input.value = String(n);
  } catch {
    /* leave input as-is while JSON is mid-edit */
  }
}

/** Write the number input into video.json textarea (keeps other fields). */
function syncTargetSecondsToEditor() {
  const input = $('targetSeconds');
  if (!input) return;
  const n = clampTargetSeconds(input.value) ?? 60;
  let video;
  try {
    video = parseVideoEditor();
  } catch {
    return;
  }
  video.targetSeconds = n;
  input.value = String(n);
  $('videoEditor').value = JSON.stringify(video, null, 2) + '\n';
}

const DESKTOP_MQ = window.matchMedia('(min-width: 768px)');
const TRASH_ICON =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M8 6V4h8v2m1 0-.9 14H8.9L8 6m-3 0 1 14h12l1-14"/></svg>';

function isDesktop() {
  return DESKTOP_MQ.matches;
}

function setNavOpen(open) {
  const sidebar = $('sidebar');
  const backdrop = $('backdrop');
  const toggle = $('navToggle');
  const shouldOpen = !!open && !isDesktop();
  document.body.classList.toggle('nav-open', shouldOpen);
  sidebar.classList.toggle('open', shouldOpen);
  if (backdrop) backdrop.hidden = !shouldOpen;
  toggle.setAttribute('aria-expanded', String(shouldOpen));
  toggle.setAttribute('aria-label', shouldOpen ? 'Close projects menu' : 'Open projects menu');
}

function closeNav() {
  setNavOpen(false);
}

function routeFor(name) {
  return name ? `#/p/${encodeURIComponent(name)}` : '#/';
}

function projectFromHash() {
  const m = location.hash.match(/^#\/p\/([^/?]+)$/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

function syncHash(name) {
  const next = routeFor(name);
  if (location.hash === next) return;
  if (!name && (!location.hash || location.hash === '#')) return;
  history.pushState({ project: name || null }, '', next);
}

function showCreateError(msg) {
  const el = $('createError');
  const title = $('newTitle');
  const folder = $('newName');
  if (!msg) {
    el.classList.add('hidden');
    el.textContent = '';
    title.removeAttribute('aria-invalid');
    folder.removeAttribute('aria-invalid');
    return;
  }
  el.textContent = msg;
  el.classList.remove('hidden');
  const folderIssue = /folder name/i.test(msg);
  title.setAttribute('aria-invalid', folderIssue ? 'false' : 'true');
  folder.setAttribute('aria-invalid', 'true');
  el.focus();
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

function setLlmStatusLine(llm) {
  const el = $('llmStatus');
  if (!el || !llm) return;
  const ready = llm.ready?.ok;
  const name = llm.label || llm.provider || 'LLM';
  el.textContent = ready ? `LLM: ${name}` : `LLM: ${name} (not ready)`;
}

async function refreshMeta() {
  const meta = await api('/api/meta');
  $('version').textContent = `v${meta.version}`;
  setLlmStatusLine(meta.llm);
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
    del.innerHTML = TRASH_ICON;
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
      showEmpty({ fromHash: false });
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

function setTab(name, { focus = false } = {}) {
  const tabs = [...document.querySelectorAll('.tab')];
  let active = null;
  tabs.forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on) active = t;
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    const on = p.dataset.panel === name;
    p.classList.toggle('active', on);
    p.hidden = !on;
  });
  if (focus && active) active.focus();
}

function showEmpty({ fromHash = false } = {}) {
  current = null;
  $('editor').classList.add('hidden');
  $('empty').classList.remove('hidden');
  refreshPlayer(false);
  clearLog();
  setOutputStatus('idle');
  if (!fromHash) syncHash(null);
}

/** Ensure Project → Target length box + video.json agree; default 60 when missing. */
function ensureTargetSeconds(preferred = null) {
  const input = $('targetSeconds');
  let video;
  try {
    video = parseVideoEditor();
  } catch {
    const t = clampTargetSeconds(preferred) ?? clampTargetSeconds(input?.value) ?? 60;
    if (input) input.value = String(t);
    return t;
  }
  // Prefer explicit preferred (create form / box), then the Target length box, then video.json.
  const t =
    clampTargetSeconds(preferred) ??
    clampTargetSeconds(input?.value) ??
    clampTargetSeconds(video.targetSeconds) ??
    60;
  normalizeVideoTargetSeconds(video, t);
  video.targetSeconds = t;
  if (input) input.value = String(t);
  $('videoEditor').value = JSON.stringify(video, null, 2) + '\n';
  return t;
}

async function openProject(name, { fromHash = false, targetSeconds = null } = {}) {
  current = name;
  const data = await api(`/api/projects/${encodeURIComponent(name)}/files`);
  $('empty').classList.add('hidden');
  $('editor').classList.remove('hidden');
  $('projectTitle').textContent = name;
  closeNav();
  if (!fromHash) syncHash(name);
  $('videoEditor').value = data.video;
  let lang = 'en';
  const t = ensureTargetSeconds(targetSeconds);
  try {
    lang = parseVideoEditor().lang || 'en';
  } catch {
    /* ignore */
  }
  $('projectMeta').textContent = `lang=${lang} · ~${t}s · click tabs to edit files`;
  if ($('storyboardEditor')) $('storyboardEditor').value = data.storyboard || '';
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
  const createdTarget = clampTargetSeconds($('newTargetSeconds')?.value) ?? 60;
  try {
    const created = await api('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name,
        title: title || name,
        lang: $('newLang').value,
        size: $('newSize').value,
        targetSeconds: createdTarget,
      }),
    });
    $('newName').value = '';
    $('newTitle').value = '';
    $('newName').placeholder = 'auto from title (a-z, 0-9, -)';
    await refreshProjects();
    // Carry create-form Target length into Project → Target length (seconds).
    const t = clampTargetSeconds(created?.targetSeconds) ?? createdTarget;
    await openProject(name, { targetSeconds: t });
    closeNav();
  } catch (e) {
    const hint = e.body?.hint ? ` ${e.body.hint}` : '';
    showCreateError((e.message || 'Create failed') + hint);
  } finally {
    $('createBtn').disabled = false;
  }
}

async function saveProject() {
  if (!current) return;
  syncTargetSecondsToEditor();
  await api(`/api/projects/${encodeURIComponent(current)}/files`, {
    method: 'PUT',
    body: JSON.stringify({
      video: $('videoEditor').value,
      storyboard: $('storyboardEditor') ? $('storyboardEditor').value : '',
      script: $('scriptEditor').value,
      scenes: $('scenesEditor').value,
    }),
  });
  setOutputStatus('saved', 'ok');
  log('saved', 'ok');
  revealOutput();
  try {
    const video = JSON.parse($('videoEditor').value);
    const lang = video.lang || 'en';
    const t = clampTargetSeconds(video.targetSeconds);
    $('projectMeta').textContent =
      `lang=${lang}${t != null ? ` · ~${t}s` : ''} · click tabs to edit files`;
  } catch {
    /* ignore */
  }
}

async function autogenerate() {
  if (!current) return;
  clearLog();
  setOutputStatus('generating…', 'busy');
  revealOutput();
  log('Autogenerating via Settings LLM (local Gemma or MiniMax)…');
  try {
    let video;
    try {
      video = parseVideoEditor();
    } catch {
      throw new Error('video.json is not valid JSON — fix it in the Project tab first');
    }
    // Canonical: Project tab → Target length (seconds) box.
    const targetSeconds = ensureTargetSeconds(clampTargetSeconds($('targetSeconds')?.value));
    try {
      video = parseVideoEditor();
    } catch {
      throw new Error('video.json is not valid JSON — fix it in the Project tab first');
    }
    const title = video.title || current;
    const lang = video.lang || 'en';
    const storyboard = $('storyboardEditor') ? $('storyboardEditor').value : '';
    log(`Target length ${targetSeconds}s (Project tab)…`);
    const data = await api(`/api/projects/${encodeURIComponent(current)}/generate`, {
      method: 'POST',
      body: JSON.stringify({ title, lang, storyboard, targetSeconds }),
    });
    $('videoEditor').value = data.video;
    ensureTargetSeconds(targetSeconds);
    if ($('storyboardEditor') && data.storyboard != null) {
      $('storyboardEditor').value = data.storyboard;
    }
    $('scriptEditor').value = data.script;
    $('scenesEditor').value = data.scenes;
    setTab('script');
    const src =
      data.source && data.source !== 'fallback'
        ? ` from ${data.source}`
        : ' (stub — APEXPLAIN_LLM=mock)';
    const subj = data.subject ? ` about “${data.subject}”` : '';
    const shape =
      Array.isArray(data.outline) && data.outline.length
        ? ` · outline ${data.outline.join(' → ')}`
        : '';
    const boardNote = storyboard.trim() ? ' · from storyboard' : '';
    setOutputStatus('generated', 'ok');
    log(
      `Autogenerated${subj}${src}${shape}${boardNote} · target ~${targetSeconds}s. Review script.md, then Make video.`,
      'ok',
    );
    revealOutput();
  } catch (e) {
    setOutputStatus('error', 'err');
    const hint = e.body?.hint ? `\n${e.body.hint}` : '';
    log((e.message || 'generate failed') + hint, 'err');
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

const tabs = [...document.querySelectorAll('.tab')];
tabs.forEach((tab) => {
  tab.addEventListener('click', () => setTab(tab.dataset.tab));
  tab.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(tab);
    if (i < 0) return;
    let next = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    setTab(tabs[next].dataset.tab, { focus: true });
  });
});

$('newTitle').addEventListener('input', () => {
  if (!$('newName').value.trim()) {
    $('newName').placeholder = slugify($('newTitle').value) || 'auto from title';
  }
});

if ($('targetSeconds')) {
  $('targetSeconds').addEventListener('change', () => syncTargetSecondsToEditor());
  $('targetSeconds').addEventListener('blur', () => syncTargetSecondsToEditor());
}
if ($('videoEditor')) {
  $('videoEditor').addEventListener('input', () => syncTargetSecondsFromEditor());
}

let settingsCache = null;
let settingsClearKey = false;
let settingsLastFocus = null;

function showSettingsError(msg) {
  const el = $('settingsError');
  if (!msg) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.textContent = msg;
  el.classList.remove('hidden');
}

function fillModelList(presets) {
  const list = $('llmModelList');
  list.innerHTML = '';
  for (const m of presets || []) {
    const opt = document.createElement('option');
    opt.value = m;
    list.appendChild(opt);
  }
}

function applyProviderUi(providerId) {
  const preset = (settingsCache?.providers || []).find((p) => p.id === providerId);
  $('llmHelp').textContent = preset?.helpText || '';
  const gemma = providerId === 'local-gemma';
  $('gemmaFields').classList.toggle('hidden', !gemma);
  $('minimaxFields').classList.toggle('hidden', gemma);
  if (preset) {
    if (gemma) {
      $('llmEndpoint').value = preset.defaultEndpoint;
      $('llmModel').value = preset.defaultModel;
    } else {
      fillModelList(preset.modelPresets);
      if (!$('llmEndpoint').value) $('llmEndpoint').value = preset.defaultEndpoint;
      if (!$('llmModel').value) $('llmModel').value = preset.defaultModel;
    }
  }
  const g = settingsCache?.gemma;
  if (g) {
    $('gemmaStatus').textContent = g.ok
      ? `Status: Ready — ${g.detail}`
      : `Status: Not downloaded — ${g.detail}`;
    $('gemmaDownload').disabled = !!g.ok;
  }
}

async function openSettings() {
  showSettingsError('');
  settingsClearKey = false;
  const data = await api('/api/settings');
  settingsCache = data;
  const sel = $('llmProvider');
  sel.innerHTML = '';
  for (const p of data.providers) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    sel.appendChild(opt);
  }
  sel.value = data.provider;
  $('llmEndpoint').value = data.apiEndpoint || '';
  $('llmModel').value = data.model || '';
  $('llmApiKey').value = '';
  $('llmApiKey').placeholder = data.apiKeySet
    ? `Saved key ${data.apiKeyHint} — paste to replace`
    : data.apiKeyPlaceholder || 'Paste your Minimax API key…';
  $('llmApiKey').type = 'password';
  $('llmShowKey').textContent = 'Show';
  applyProviderUi(data.provider);
  fillTtsSettings(data.tts);
  settingsLastFocus = document.activeElement;
  setEngineError('kokoro', '');
  setEngineError('vocello', '');
  refreshModels().catch((e) => {
    setEngineError('kokoro', e.message);
    setEngineError('vocello', e.message);
  });
  $('settingsModal').classList.remove('hidden');
  $('settingsClose').focus();
}

function fillTtsSettings(tts) {
  const t = tts || {};
  const kokoro = t.kokoro || {};
  const vocello = t.vocello || {};
  const sel = $('kokoroVoice');
  if (sel) {
    sel.innerHTML = '';
    for (const id of t.kokoroVoices || ['af_heart']) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      sel.appendChild(opt);
    }
    sel.value = kokoro.voice || 'af_heart';
  }
  if ($('kokoroSpeed')) $('kokoroSpeed').value = kokoro.speed != null ? kokoro.speed : 1;
  if ($('vocelloBrief')) $('vocelloBrief').value = vocello.voiceBrief || '';
  if ($('vocelloSeed')) $('vocelloSeed').value = vocello.seed != null ? vocello.seed : 42;
  if ($('vocelloLanguage')) $('vocelloLanguage').value = vocello.language || 'chinese';
  if ($('vocelloDelivery')) $('vocelloDelivery').value = vocello.delivery || '';
}

function readTtsSettingsFromForm() {
  return {
    kokoro: {
      voice: $('kokoroVoice')?.value || 'af_heart',
      speed: Number($('kokoroSpeed')?.value || 1),
    },
    vocello: {
      voiceBrief: $('vocelloBrief')?.value || '',
      seed: Number($('vocelloSeed')?.value || 42),
      language: $('vocelloLanguage')?.value || 'chinese',
      delivery: $('vocelloDelivery')?.value || '',
    },
  };
}

function closeSettings() {
  $('settingsModal').classList.add('hidden');
  if (settingsLastFocus && typeof settingsLastFocus.focus === 'function') {
    settingsLastFocus.focus();
  }
}

async function saveSettings() {
  showSettingsError('');
  try {
    const provider = $('llmProvider').value;
    const body = {
      provider,
      apiEndpoint: $('llmEndpoint').value,
      model: $('llmModel').value,
    };
    const typed = $('llmApiKey').value.trim();
    if (settingsClearKey) body.clearApiKey = true;
    else if (typed) body.apiKey = typed;
    body.tts = readTtsSettingsFromForm();
    const data = await api('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
    settingsCache = { ...settingsCache, ...data };
    setLlmStatusLine(data);
    closeSettings();
  } catch (e) {
    showSettingsError(e.message || 'Save failed');
  }
}

async function downloadGemma() {
  showSettingsError('');
  const logEl = $('gemmaLog');
  logEl.classList.remove('hidden');
  logEl.textContent = '';
  $('gemmaDownload').disabled = true;
  $('gemmaStatus').textContent = 'Status: Downloading… (~2 GB, this can take a while)';
  try {
    const res = await fetch('/api/settings/gemma/download', { method: 'POST' });
    if (!res.ok || !res.body) throw new Error(await res.text());
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let errPayload = null;
    let donePayload = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        let event = 'message';
        let data = '';
        for (const line of part.split('\n')) {
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
        if (event === 'log' && payload.line) {
          logEl.textContent += payload.line + '\n';
          logEl.scrollTop = logEl.scrollHeight;
        } else if (event === 'error') errPayload = payload;
        else if (event === 'done') donePayload = payload;
      }
    }
    if (errPayload) throw new Error(errPayload.message || 'Download failed');
    if (settingsCache) settingsCache.gemma = donePayload?.gemma || settingsCache.gemma;
    $('gemmaStatus').textContent = donePayload?.gemma?.ok
      ? `Status: Ready — ${donePayload.gemma.detail}`
      : 'Status: Download finished';
    await refreshMeta();
  } catch (e) {
    showSettingsError(e.message || 'Download failed');
    $('gemmaDownload').disabled = false;
  }
}

$('createBtn').addEventListener('click', () => createProject());
$('saveBtn').addEventListener('click', () => saveProject().catch((e) => log(e.message, 'err')));
$('generateBtn').addEventListener('click', () => autogenerate());
$('dryBtn').addEventListener('click', () => runMake({ dryRun: true }));
$('makeBtn').addEventListener('click', () => runMake({ dryRun: false }));
$('settingsBtn').addEventListener('click', () => openSettings().catch((e) => window.alert(e.message)));
$('settingsClose').addEventListener('click', () => closeSettings());
$('settingsCancel').addEventListener('click', () => closeSettings());
$('settingsSave').addEventListener('click', () => saveSettings());
$('llmProvider').addEventListener('change', (e) => {
  const id = e.target.value;
  const preset = (settingsCache?.providers || []).find((p) => p.id === id);
  if (preset) {
    $('llmEndpoint').value = preset.defaultEndpoint;
    $('llmModel').value = preset.defaultModel;
    $('llmApiKey').placeholder = preset.apiKeyPlaceholder || '';
    fillModelList(preset.modelPresets);
  }
  applyProviderUi(id);
});
$('llmShowKey').addEventListener('click', () => {
  const input = $('llmApiKey');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  $('llmShowKey').textContent = show ? 'Hide' : 'Show';
});
$('llmClearKey').addEventListener('click', () => {
  settingsClearKey = true;
  $('llmApiKey').value = '';
  $('llmApiKey').placeholder = 'Key will be cleared on Save';
});
$('gemmaDownload').addEventListener('click', () => downloadGemma());
$('settingsModal').addEventListener('click', (e) => {
  if (e.target === $('settingsModal')) closeSettings();
});
$('navToggle').addEventListener('click', () => {
  setNavOpen(!document.body.classList.contains('nav-open'));
});
$('backdrop').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeNav();
});
$('emptyOpenNav').addEventListener('click', () => {
  setNavOpen(true);
  $('newTitle').focus();
});
DESKTOP_MQ.addEventListener('change', () => {
  if (isDesktop()) closeNav();
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === '.') {
    e.preventDefault();
    if ($('settingsModal').classList.contains('hidden')) {
      openSettings().catch((err) => window.alert(err.message));
    } else {
      closeSettings();
    }
    return;
  }
  if (e.key !== 'Escape') return;
  if (!$('settingsModal').classList.contains('hidden')) {
    closeSettings();
    return;
  }
  closeNav();
});
$('settingsModal').addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || $('settingsModal').classList.contains('hidden')) return;
  const nodes = [...$('settingsModal').querySelectorAll('button, [href], input, select, textarea')]
    .filter((el) => !el.disabled && el.offsetParent !== null);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

function applyRoute() {
  const name = projectFromHash();
  if (name && name !== current) {
    openProject(name, { fromHash: true }).catch((e) => {
      showEmpty({ fromHash: true });
      log(e.message || 'Could not open project', 'err');
    });
  } else if (!name && current) {
    showEmpty({ fromHash: true });
  }
}

window.addEventListener('popstate', applyRoute);
window.addEventListener('hashchange', applyRoute);

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

function wireTtsSettings() {
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

wireTtsSettings();

refreshMeta()
  .then(refreshProjects)
  .then(() => applyRoute())
  .catch((e) => {
    $('version').textContent = e.message;
  });
