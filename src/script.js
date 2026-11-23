/**
 * Parser for script.md (English subset of explainroo's grammar).
 *
 *   # Title
 *   ## scene-id {hold=1.5}
 *   Narration. [#mark] [pause 0.5] {shown|spoken}
 *   > notes and <!-- comments --> are ignored.
 */
import { ApexError } from './errors.js';

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const ATTR_NUMBERS = new Set(['hold', 'min', 'lead', 'gap', 'max']);

function scriptFail(message, line, rule = 'script') {
  throw new ApexError(line ? `script.md line ${line}: ${message}` : `script.md: ${message}`, {
    code: 'bad_script',
    path: line ? `script.md:${line}` : 'script.md',
    rule,
  });
}

function parseAttrs(src, line) {
  const attrs = {};
  if (!src) return attrs;
  const token = /[^\s,=:]+[=:](?:"[^"]*"|'[^']*'|[^\s,]+)|[^\s,]+/y;
  let i = 0;
  while (i < src.length) {
    if (/[\s,]/.test(src[i])) {
      i++;
      continue;
    }
    token.lastIndex = i;
    const part = token.exec(src)?.[0];
    if (!part) scriptFail(`cannot read scene attribute near "${src.slice(i)}"`, line, 'attrs');
    i = token.lastIndex;
    const m = /^([a-zA-Z][\w-]*)\s*[=:]\s*(.+)$/.exec(part);
    if (!m) scriptFail(`cannot read scene attribute "${part}" (use key=value)`, line, 'attrs');
    const [, key, raw] = m;
    const value = raw.replace(/^["']|["']$/g, '');
    if (ATTR_NUMBERS.has(key)) {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) scriptFail(`attribute ${key} must be a number >= 0`, line, 'attrs');
      attrs[key] = n;
    } else {
      attrs[key] = value;
    }
  }
  return attrs;
}

/**
 * Tokenize one paragraph into word / mark / pause units.
 */
export function tokenizeNarration(text, line = 0) {
  const units = [];
  let i = 0;
  let pendingSpace = false;
  const n = text.length;

  const pushWord = (display, spoken) => {
    units.push({
      type: 'word',
      display,
      spoken,
      space: pendingSpace || !units.some((u) => u.type === 'word'),
    });
    pendingSpace = false;
  };

  while (i < n) {
    const c = text[i];
    if (/\s/.test(c)) {
      pendingSpace = true;
      i++;
      continue;
    }
    if (text.startsWith('[#', i)) {
      const end = text.indexOf(']', i);
      const name = end === -1 ? '' : text.slice(i + 2, end);
      if (!/^[A-Za-z0-9_-]+$/.test(name)) {
        scriptFail(`marker "${text.slice(i, end + 1 || i + 12)}" should look like [#name]`, line, 'marker');
      }
      units.push({ type: 'mark', name });
      i = end + 1;
      continue;
    }
    if (text.startsWith('[pause', i)) {
      const end = text.indexOf(']', i);
      const arg = end === -1 ? null : text.slice(i + 6, end).trim();
      const sec = arg === '' ? 0.5 : Number(arg);
      if (end === -1 || !Number.isFinite(sec) || sec < 0 || sec > 10) {
        scriptFail('pauses look like [pause] or [pause 0.8] (0 to 10 seconds)', line, 'pause');
      }
      units.push({ type: 'pause', sec });
      pendingSpace = true;
      i = end + 1;
      continue;
    }
    if (c === '{') {
      const end = text.indexOf('}', i);
      const inner = end === -1 ? '' : text.slice(i + 1, end);
      const bar = inner.indexOf('|');
      if (end === -1 || bar === -1 || !inner.slice(0, bar).trim() || !inner.slice(bar + 1).trim()) {
        scriptFail('pronunciation overrides look like {shown|spoken}', line, 'override');
      }
      let j = end + 1;
      while (j < n && !/\s/.test(text[j]) && text[j] !== '[' && text[j] !== '{') j++;
      const trail = text.slice(end + 1, j);
      pushWord(inner.slice(0, bar).trim() + trail, inner.slice(bar + 1).trim() + trail);
      i = j;
      continue;
    }
    let j = i;
    while (
      j < n &&
      !/\s/.test(text[j]) &&
      !text.startsWith('[#', j) &&
      !text.startsWith('[pause', j) &&
      text[j] !== '{'
    ) {
      j++;
      // Break after CJK / ASCII sentence punctuation so "句。句！" becomes two words.
      if (/[.!?…。！？｡]/.test(text[j - 1])) break;
    }
    pushWord(text.slice(i, j), text.slice(i, j));
    i = j;
  }
  return units;
}

/**
 * Split units into speakable chunks.
 * With splitOnMarks, [#marker] also starts a new chunk (for exact TTS cue times).
 */
export function speechChunks(
  units,
  { sentenceGap = 0.3, paragraphGap = 0.55, pace = 1, splitOnMarks = false } = {},
) {
  const sentenceEnd = /[.!?…。！？｡]["'’"」』)\]]*$/u;
  const chunks = [];
  let cur = null;
  let gapBefore = 0;
  let pendingMarks = [];
  let sentenceIndex = 0;
  const close = ({ endedSentence = false } = {}) => {
    if (cur && cur.words.length) {
      cur.sentenceIndex = sentenceIndex;
      cur.sentence = endedSentence;
      chunks.push(cur);
      if (endedSentence) sentenceIndex++;
    }
    cur = null;
  };

  units.forEach((u, index) => {
    if (u.type === 'pause') {
      close({ endedSentence: !!cur });
      gapBefore = u.paragraph
        ? Math.max(gapBefore, paragraphGap / pace)
        : gapBefore + (u.sec ?? 0) / pace;
      return;
    }
    if (u.type === 'mark') {
      if (splitOnMarks) {
        close({ endedSentence: false });
        pendingMarks.push(u.name);
      }
      return;
    }
    if (u.type !== 'word') return;
    // Orphan punctuation after an English "?" before "。" (e.g. "cat?。") must not
    // become its own TTS chunk — Cantonese TTS rejects empty/punct-only fragments.
    const onlyPunct = !/[\p{L}\p{N}]/u.test(u.spoken);
    if (onlyPunct && !cur && chunks.length) {
      const prev = chunks[chunks.length - 1];
      prev.text = joinSpoken(prev.text, u.spoken);
      prev.words.push({ unitIndex: index, display: u.display, spoken: u.spoken });
      return;
    }
    if (onlyPunct && !cur) return;
    if (!cur) {
      cur = {
        gapBefore,
        words: [],
        text: '',
        marks: pendingMarks.splice(0),
        sentence: false,
        sentenceIndex,
      };
      gapBefore = 0;
    }
    cur.text = joinSpoken(cur.text, u.spoken);
    cur.words.push({ unitIndex: index, display: u.display, spoken: u.spoken });
    if (sentenceEnd.test(u.spoken)) {
      close({ endedSentence: true });
      gapBefore = sentenceGap / pace;
    }
  });
  close({ endedSentence: !!cur });
  return chunks;
}

const CJK_TAIL = /[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF]$/u;
const CJK_HEAD = /^[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF]/u;

/** Join spoken tokens without inserting spaces between CJK runs. */
export function joinSpoken(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (CJK_TAIL.test(a) && CJK_HEAD.test(b)) return a + b;
  if (/[。！？｡、，：；]$/u.test(a)) return a + b;
  // Attach trailing CJK/ASCII punctuation tightly ("cat?" + "。" → "cat?。").
  if (/^[。！？｡、，：；.!?,;:…]+/u.test(b)) return a + b;
  return `${a} ${b}`;
}

/**
 * Sentence boundaries only (ignores [#markers] for counting).
 * Marks map to the sentence index they precede (0-based).
 */
export function markerMap(units) {
  const sentenceEnd = /[.!?…。！？｡]["'’"」』)\]]*$/u;
  const marks = {};
  let sentenceIndex = 0;
  let inSentence = false;
  let sentenceCount = 0;

  for (const u of units) {
    if (u.type === 'mark') {
      marks[u.name] = sentenceIndex;
      continue;
    }
    if (u.type === 'pause') {
      if (inSentence) {
        sentenceCount++;
        sentenceIndex++;
        inSentence = false;
      }
      continue;
    }
    if (u.type !== 'word') continue;
    if (!inSentence) inSentence = true;
    if (sentenceEnd.test(u.spoken)) {
      sentenceCount++;
      sentenceIndex++;
      inSentence = false;
    }
  }
  if (inSentence) sentenceCount++;

  return { marks, sentenceCount, chunks: speechChunks(units) };
}

export function parseScript(source, { file = 'script.md' } = {}) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  let title = null;
  const scenes = [];
  let current = null;
  let inComment = false;
  const seen = new Set();

  const flushParagraph = () => {
    if (!current) return;
    if (current._para.length) {
      current._paras.push({ text: current._para.join(' '), line: current._paraLine });
      current._para = [];
    }
  };

  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    let line = raw;
    if (inComment) {
      const end = line.indexOf('-->');
      if (end === -1) return;
      line = line.slice(end + 3);
      inComment = false;
    }
    line = line.replace(/<!--[\s\S]*?-->/g, '');
    const open = line.indexOf('<!--');
    if (open !== -1) {
      line = line.slice(0, open);
      inComment = true;
    }
    const trimmed = line.trim();

    const h1 = /^#\s+(.+)$/.exec(trimmed);
    if (h1 && !trimmed.startsWith('##')) {
      if (!current && title === null) title = h1[1].trim();
      else scriptFail('a single "#" title is only allowed once, before the first scene', lineNo, 'title');
      return;
    }

    const h2 = /^##\s+([^\s{]+)\s*(?:\{([^}]*)\})?\s*$/.exec(trimmed);
    if (h2) {
      flushParagraph();
      const id = h2[1];
      if (!ID_RE.test(id)) {
        scriptFail(`scene id "${id}" may only use letters, digits, "-" and "_"`, lineNo, 'scene_id');
      }
      if (seen.has(id)) scriptFail(`scene id "${id}" is used twice`, lineNo, 'unique_id');
      seen.add(id);
      current = {
        id,
        attrs: parseAttrs(h2[2], lineNo),
        line: lineNo,
        _paras: [],
        _para: [],
        _paraLine: lineNo,
      };
      scenes.push(current);
      return;
    }

    if (trimmed.startsWith('##')) {
      scriptFail('scene headings look like "## scene-id" or "## scene-id {hold=1}"', lineNo, 'heading');
    }
    if (trimmed.startsWith('>')) return;
    if (!trimmed) {
      flushParagraph();
      return;
    }
    if (!current) scriptFail('narration must come after a "## scene-id" heading', lineNo, 'order');
    if (!current._para.length) current._paraLine = lineNo;
    current._para.push(trimmed);
  });

  if (inComment) scriptFail('an HTML comment is never closed', null, 'comment');
  flushParagraph();
  if (!scenes.length) scriptFail('no scenes found; start one with "## scene-id"', null, 'scenes');

  return {
    file,
    title,
    scenes: scenes.map((s) => {
      const units = [];
      s._paras.forEach((p, pi) => {
        if (pi > 0) units.push({ type: 'pause', sec: null, paragraph: true });
        units.push(...tokenizeNarration(p.text, p.line));
      });
      const words = units.filter((u) => u.type === 'word');
      const { marks, sentenceCount, chunks } = markerMap(units);
      return {
        id: s.id,
        attrs: s.attrs,
        line: s.line,
        units,
        marks,
        sentenceCount,
        chunks,
        text: words.map((w, i) => (i && w.space ? ' ' : '') + w.display).join(''),
        spoken: words.map((w, i) => (i && w.space ? ' ' : '') + w.spoken).join(''),
      };
    }),
  };
}
