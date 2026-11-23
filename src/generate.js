/**
 * Autogenerate ~1 min script + scenes from a topic title.
 * Outline is chosen from title intent + Wikipedia sections (not a fixed template).
 * Layout pick follows explainroo `docs pictures`: which relationship does the
 * scene show — an order, a comparison, the parts of a whole, or a cause —
 * mapped onto Apexplain's declarative layouts.
 * zh-HK: Wikipedia zh + OpenCC cn→hk so script/scenes stay Traditional (HK).
 * Local-first: uses an intent-based stub by default.
 * Set APEXPLAIN_ALLOW_NET=1 to enrich from Wikipedia (falls back to stub on fail).
 */
import { toTradHk, zhHkCopy } from './zh.js';

const WIKI_UA = 'Apexplain/0.0.1 (local explainer; https://github.com/roxelfivan/Apexplain)';

const SKIP_SECTIONS =
  /^(references?|see also|external links?|notes?|further reading|bibliography|sources?|citations?|footnotes?|gallery|awards?|參考|参见|參見|外部連結|外部链接|註釋|注释|參考文獻|参考文献|延伸閱讀|延伸阅读|相關條目|相关条目|圖庫|图库)$/i;

export function slugifyName(input) {
  const s = String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 48);
  return s || `project-${Date.now().toString(36)}`;
}

export function extractSubject(title) {
  let t = String(title || '').trim();
  if (!t) return 'this topic';
  t = t
    .replace(/^(what(?:'s| is| are)\s+(?:an?\s+)?)/i, '')
    .replace(/^(who(?:'s| is| are)\s+)/i, '')
    .replace(/^(how\s+(?:do(?:es)?|can|to)\s+)/i, '')
    .replace(/^(why\s+(?:do(?:es)?|is|are|we|does)\s+)/i, '')
    .replace(/^(explain|about|intro(?:duction)?\s+to)\s+/i, '')
    .replace(
      /^(什麼是|什么是|邊個係|边个係|點解有|点解有|點解會|点解会|點解|点解|點樣|点样|如何|簡介|简介)\s*/u,
      '',
    )
    .replace(/[?？！!。.]+$/u, '')
    .trim();
  return t || String(title).trim();
}

/** Classify the explainer shape from the raw title. */
export function detectIntent(title) {
  const t = String(title || '').trim();
  if (/^(what(?:'s| is| are)\b|什麼是|什么是|咩係|邊個係)/i.test(t)) return 'definition';
  if (/^(how\b|點樣|点样|如何|怎麼|怎么)/i.test(t)) return 'how';
  if (/^(why\b|點解|点解|為什麼|为什么)/i.test(t)) return 'why';
  if (/\b(vs\.?|versus|compared to|difference between|對比|比较|對照)\b/i.test(t)) return 'compare';
  if (/\b(history|origin|evolution|發明|歷史|历史|起源)\b/i.test(t)) return 'history';
  return 'topic';
}

/**
 * @param {{ title: string, lang?: string }} opts
 */
export async function generateExplainer({ title, lang = 'en' }) {
  const topic = String(title || 'this topic').trim() || 'this topic';
  const subject = extractSubject(topic);
  const intent = detectIntent(topic);
  const facts = await lookupTopic(subject, lang).catch(() => null);
  const outline = planOutline({ intent, topic, subject, facts, lang });
  return buildFromOutline({ topic, subject, intent, facts, outline, lang });
}

async function lookupTopic(subject, lang) {
  // Local-first: Wikipedia only when explicitly opted in.
  if (process.env.APEXPLAIN_OFFLINE === '1') return null;
  if (process.env.APEXPLAIN_ALLOW_NET !== '1') return null;
  if (lang === 'zh-HK') {
    const zhTitle = await resolveZhTitle(subject);
    if (zhTitle) {
      const hit = await wikiBundle('zh', zhTitle);
      if (hit?.sentences?.length) return hit;
    }
    for (const q of uniqueQueries(subject, 'zh-HK')) {
      const hit = await wikiBundle('zh', q);
      if (hit?.sentences?.length && !/^[A-Za-z0-9]/.test(hit.extract || '')) return hit;
    }
    for (const q of uniqueQueries(subject, 'en')) {
      const hit = await wikiBundle('en', q);
      if (hit?.sentences?.length) return hit;
    }
    return null;
  }
  for (const q of uniqueQueries(subject, 'en')) {
    const hit = await wikiBundle('en', q);
    if (hit?.sentences?.length) return hit;
  }
  return null;
}

async function resolveZhTitle(subject) {
  const enHit = await wikiSearch('en', subject.replace(/^(an?|the)\s+/i, ''));
  if (!enHit) return null;
  const url =
    `https://en.wikipedia.org/w/api.php?` +
    new URLSearchParams({
      action: 'query',
      prop: 'langlinks',
      titles: enHit,
      lllang: 'zh',
      format: 'json',
    });
  const res = await fetch(url, {
    headers: { 'user-agent': WIKI_UA, accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  for (const p of Object.values(data?.query?.pages || {})) {
    const zh = p?.langlinks?.[0]?.['*'];
    if (zh) return String(zh);
  }
  return null;
}

function uniqueQueries(subject, lang) {
  const out = [];
  const push = (s) => {
    const v = String(s || '').trim();
    if (v && !out.includes(v)) out.push(v);
  };
  push(subject);
  if (lang !== 'zh-HK') {
    push(subject.replace(/^(an?|the)\s+/i, ''));
    push(subject.replace(/\s+/g, '_'));
  }
  return out;
}

async function wikiBundle(wiki, title) {
  const resolved = await wikiSearch(wiki, title);
  const page = resolved || title;
  const summary = await wikiSummary(wiki, page);
  if (!summary) return null;
  const sections = await wikiSections(wiki, summary.pageTitle || page);
  return { ...summary, sections, wiki };
}

async function wikiSummary(wiki, title) {
  // zh: MediaWiki extracts with variant=zh-hk → Traditional HK (REST is often Simplified).
  if (wiki === 'zh') {
    const hk = await wikiExtractZhHk(title);
    if (hk) return hk;
  }
  const url = `https://${wiki}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: {
      'user-agent': WIKI_UA,
      accept: 'application/json',
      ...(wiki === 'zh' ? { 'accept-language': 'zh-HK,zh-Hant;q=0.9' } : {}),
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.type === 'disambiguation' || !data.extract) return null;
  let extract = String(data.extract || '').replace(/\s+/g, ' ').trim();
  let pageTitle = String(data.title || title);
  let description = String(data.description || '').trim();
  if (wiki === 'zh') {
    extract = toTradHk(extract);
    pageTitle = toTradHk(pageTitle);
    description = toTradHk(description);
  }
  const lang = wiki === 'zh' ? 'zh' : 'en';
  const sentences = splitSentences(extract, lang).slice(0, 10);
  if (!sentences.length) return null;
  return {
    pageTitle,
    description,
    extract,
    sentences,
    source: `${wiki}.wikipedia.org`,
  };
}

/** Prefer Traditional HK Wikipedia extract. */
async function wikiExtractZhHk(title) {
  const url =
    `https://zh.wikipedia.org/w/api.php?` +
    new URLSearchParams({
      action: 'query',
      prop: 'extracts|description',
      exintro: '0',
      explaintext: '1',
      exchars: '1200',
      titles: title,
      variant: 'zh-hk',
      redirects: '1',
      format: 'json',
    });
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': WIKI_UA, accept: 'application/json', 'accept-language': 'zh-HK' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const page = Object.values(data?.query?.pages || {})[0];
    if (!page || page.missing != null || !page.extract) return null;
    const extract = toTradHk(String(page.extract || '').replace(/\s+/g, ' ').trim());
    const pageTitle = toTradHk(String(page.title || title));
    const description = toTradHk(String(page.description || '').trim());
    const sentences = splitSentences(extract, 'zh').slice(0, 10);
    if (!sentences.length) return null;
    return {
      pageTitle,
      description: description || shortLabel(sentences[0], 28, { zh: true }),
      extract,
      sentences,
      source: 'zh.wikipedia.org',
    };
  } catch {
    return null;
  }
}

async function wikiSearch(wiki, query) {
  const url =
    `https://${wiki}.wikipedia.org/w/api.php?` +
    new URLSearchParams({
      action: 'opensearch',
      search: query,
      limit: '1',
      namespace: '0',
      format: 'json',
    });
  const res = await fetch(url, {
    headers: { 'user-agent': WIKI_UA, accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data?.[1]?.[0];
  return hit ? String(hit) : null;
}

async function wikiSections(wiki, title) {
  const params = {
    action: 'parse',
    page: title,
    prop: 'sections',
    format: 'json',
  };
  if (wiki === 'zh') params.variant = 'zh-hk';
  const url = `https://${wiki}.wikipedia.org/w/api.php?` + new URLSearchParams(params);
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': WIKI_UA,
        accept: 'application/json',
        ...(wiki === 'zh' ? { 'accept-language': 'zh-HK' } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const sections = data?.parse?.sections || [];
    return sections
      .filter((s) => Number(s.toclevel) === 1 || Number(s.toclevel) === 2)
      .map((s) => {
        const line = String(s.line || '').replace(/<[^>]+>/g, '').trim();
        return wiki === 'zh' ? toTradHk(line) : line;
      })
      .filter((line) => line && !SKIP_SECTIONS.test(line))
      .slice(0, 12);
  } catch {
    return [];
  }
}

function splitSentences(text, lang) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  if (lang === 'zh') {
    return raw
      .split(/(?<=[。！？])/)
      .map((s) => s.trim())
      .filter((s) => /[\p{L}\p{N}]/u.test(s));
  }
  return raw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

/**
 * On-screen label from a narration/wiki sentence.
 * Like explainroo pictures: a few complete words — never mid-word "…".
 * Canvas layouts wrap, so we keep whole phrases instead of truncating.
 */
export function shortLabel(text, max = 42, opts = {}) {
  const zh = opts.zh === true;
  const maxWords = opts.maxWords ?? (zh ? max : 7);
  let s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\[#[\w-]+\]\s*/g, '')
    .replace(/[.。！？?!,;:：；]+$/u, '')
    .trim();
  if (!s) return '';

  // Prefer a substantive clause — skip tiny lead-ins like 「閏年」 alone.
  // Skip when the caller already built a join (e.g. close title).
  if (!opts.keepList) {
    const parts = s.split(/[,;:–—]|，|；|：|、/).map((p) => p.trim()).filter(Boolean);
    const minPart = zh || /[\u3400-\u9FFF]/.test(s) ? 5 : 8;
    const clause = parts.find((p) => p.length >= minPart) || parts[0] || s;
    if (clause) s = clause;
  }

  if (zh || /[\u3400-\u9FFF]/.test(s)) {
    if (s.length <= max) return s;
    // Cut only at a phrase break inside the budget; never append "…".
    const window = s.slice(0, max);
    const breakAt = Math.max(
      window.lastIndexOf('，'),
      window.lastIndexOf('、'),
      window.lastIndexOf('的'),
      window.lastIndexOf('同'),
      window.lastIndexOf('和'),
      window.lastIndexOf('與'),
      window.lastIndexOf('与'),
    );
    if (breakAt >= Math.min(4, Math.floor(max / 3))) {
      return window.slice(0, breakAt).replace(/[，、的同和與与]+$/u, '').trim();
    }
    return window.trim();
  }

  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords && s.length <= max) return s;

  const out = [];
  let len = 0;
  for (const w of words) {
    if (out.length >= maxWords) break;
    const next = len + w.length + (out.length ? 1 : 0);
    if (out.length && next > max) break;
    out.push(w);
    len = next;
  }
  // Drop a dangling article/preposition so labels don't end on "of" / "a".
  while (
    out.length > 2 &&
    /^(?:a|an|the|of|to|for|in|on|at|by|with|from|and|or)$/i.test(out[out.length - 1])
  ) {
    out.pop();
  }
  // Always whole words; if the first word alone is huge, keep it whole.
  return out.join(' ') || words[0] || '';
}

function ensureStop(s, lang) {
  const t = String(s || '').trim();
  if (!t) return t;
  if (/[。！？.!?]$/u.test(t)) return t;
  return lang === 'zh-HK' || /[\u3400-\u9FFF]/.test(t) ? `${t}。` : `${t}.`;
}

function slugSceneId(label, used) {
  let base = String(label || 'part')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 24);
  if (!base || !/^[a-z0-9]/i.test(base)) base = `part`;
  if (!/^[A-Za-z0-9]/.test(base)) base = `s-${base}`;
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n++}`;
  }
  used.add(id);
  return id;
}

function scoreSection(heading, intent) {
  const h = heading.toLowerCase();
  const weights = {
    definition: [/etymolog|taxonom|classif|biolog|descript|概[述念]|定義|定义|分類|分类|特徵|特征|外形/, 3],
    how: [/process|method|mechanism|function|work|步驟|方法|原理|運作|运作|結構|结构/, 3],
    why: [/cause|reason|effect|impact|consequence|原因|影響|影响|後果|后果|意義|意义/, 3],
    history: [/history|origin|evolution|develop|歷史|历史|起源|發展|发展|發明|发明/, 3],
    compare: [/compar|versus|differ|類型|类型|種類|种类|對比|对比/, 3],
    topic: [/behavior|ecology|culture|use|human|行為|行为|生態|生态|用途|文化|生活/, 2],
  };
  const [re, score] = weights[intent] || weights.topic;
  if (re.test(h)) return score;
  if (/biology|behavior|ecology|culture|history|taxonomy|distribution|interaction|特徵|生态|用途/.test(h)) {
    return 1;
  }
  return 0;
}

/**
 * Build a topic-shaped beat list: open + 2–4 middle beats + close.
 */
export function planOutline({ intent, topic, subject, facts, lang }) {
  const name = facts?.pageTitle || subject;
  const sections = facts?.sections || [];
  const ranked = sections
    .map((heading) => ({ heading, score: scoreSection(heading, intent) }))
    .sort((a, b) => b.score - a.score || a.heading.localeCompare(b.heading));

  const picked = [];
  for (const row of ranked) {
    if (picked.length >= 3) break;
    if (row.score <= 0 && picked.length >= 2) continue;
    if (picked.some((p) => p.heading === row.heading)) continue;
    picked.push(row);
  }
  // If wiki sections are thin, invent middle beats from intent.
  if (picked.length < 2) {
    picked.length = 0;
    picked.push(...defaultMiddles(intent, name, lang));
  } else if (picked.length === 1) {
    picked.push(...defaultMiddles(intent, name, lang).slice(0, 1));
  }

  const used = new Set(['open', 'close']);
  const middles = picked.slice(0, 3).map((row, i) => {
    const heading = row.heading;
    const id = slugSceneId(heading, used);
    return {
      id,
      role: 'middle',
      heading,
      layout: layoutFor(intent, heading, i),
    };
  });

  return [
    {
      id: 'open',
      role: 'open',
      heading: lang === 'zh-HK' ? name : name,
      layout: 'title',
    },
    ...middles,
    {
      id: 'close',
      role: 'close',
      heading: lang === 'zh-HK' ? '總結' : 'Takeaway',
      layout: 'title',
    },
  ];
}

function defaultMiddles(intent, name, lang) {
  const zh = lang === 'zh-HK';
  switch (intent) {
    case 'definition':
      return zh
        ? [{ heading: '係咩', score: 2 }, { heading: '特徵', score: 2 }, { heading: '日常生活', score: 1 }]
        : [
            { heading: 'Definition', score: 2 },
            { heading: 'Key traits', score: 2 },
            { heading: 'In everyday life', score: 1 },
          ];
    case 'how':
      return zh
        ? [{ heading: '問題', score: 2 }, { heading: '步驟', score: 3 }, { heading: '結果', score: 2 }]
        : [
            { heading: 'The problem', score: 2 },
            { heading: 'How it works', score: 3 },
            { heading: 'The result', score: 2 },
          ];
    case 'why':
      return zh
        ? [{ heading: '現象', score: 2 }, { heading: '原因', score: 3 }, { heading: '影響', score: 2 }]
        : [
            { heading: 'The question', score: 2 },
            { heading: 'The cause', score: 3 },
            { heading: 'What follows', score: 2 },
          ];
    case 'history':
      return zh
        ? [{ heading: '起源', score: 3 }, { heading: '變化', score: 2 }, { heading: '而家', score: 2 }]
        : [
            { heading: 'Origins', score: 3 },
            { heading: 'What changed', score: 2 },
            { heading: 'Today', score: 2 },
          ];
    case 'compare':
      return zh
        ? [{ heading: '兩邊分別', score: 3 }, { heading: '點揀', score: 2 }]
        : [
            { heading: 'Side by side', score: 3 },
            { heading: 'When to choose', score: 2 },
          ];
    default:
      return zh
        ? [{ heading: `${name}概況`, score: 2 }, { heading: '值得留意', score: 2 }]
        : [
            { heading: `About ${name}`, score: 2 },
            { heading: 'Worth noticing', score: 2 },
          ];
  }
}

/**
 * Pick a declarative layout the way explainroo plans pictures
 * (`npx explainroo docs pictures` + making-a-video step 5).
 *
 * explainroo asks: which relationship does this scene show?
 *   order → steps   | comparison → compare
 *   parts of a whole (hub) → cards | cause → flow
 *   one big number → title (Apexplain has no `number` layout)
 *
 * Open/close stay `title` in planOutline.
 */
export function layoutFor(intent, heading, _index = 0) {
  const h = String(heading || '').toLowerCase();
  const relation = sceneRelation(intent, h);

  switch (relation) {
    case 'number':
      return 'title';
    case 'comparison':
      return 'compare';
    case 'order':
      return 'steps';
    case 'cause':
      return 'flow';
    case 'parts':
    default:
      return 'cards';
  }
}

/** @returns {'number'|'comparison'|'order'|'parts'|'cause'} */
export function sceneRelation(intent, headingLower) {
  const h = String(headingLower || '').toLowerCase();

  // One big number (explainroo `number` starter).
  if (/\b(number|stat|rate|percent|figure|metric|count|總數|总数|數字|数字|數據|数据|比例|百分比|%|\d{2,})\b/i.test(h)) {
    return 'number';
  }
  // Two sides (explainroo `compare` starter).
  if (
    /compar|versus|\bvs\.?\b|differ|side by side|對比|对比|分別|分别|兩邊|两边|類型|类型|種類|种类/.test(h) ||
    intent === 'compare'
  ) {
    return 'comparison';
  }
  // Ordered sequence (explainroo `steps` starter).
  if (
    /step|process|method|procedure|pipeline|workflow|how it works|步驟|方法|流程|原理|運作|运作|階段|阶段/.test(h) ||
    intent === 'how'
  ) {
    return 'order';
  }
  // Cause → effect chain.
  if (
    /cause|reason|effect|impact|consequence|why|because|結果|结果|原因|影響|影响|後果|后果|點解|点解/.test(h) ||
    intent === 'why'
  ) {
    return 'cause';
  }
  // Timeline as ordered change still reads as order for history beats.
  if (/history|origin|timeline|evolution|發展|发展|歷史|历史|起源|發明|发明/.test(h) || intent === 'history') {
    return 'order';
  }
  // Hub: one main thing with its parts (explainroo `hub` → Apexplain cards).
  if (
    /taxonom|classif|anatom|biolog|trait|feature|part|component|structure|定義|定义|分類|分类|特徵|特征|結構|结构|組成|组成|係咩|是什么/.test(
      h,
    ) ||
    intent === 'definition'
  ) {
    return 'parts';
  }
  return 'parts';
}

function buildFromOutline({ topic, subject, intent, facts, outline, lang }) {
  const zh = lang === 'zh-HK';
  const rawName = facts?.pageTitle || subject;
  const name = zh ? zhHkCopy(rawName) : rawName;
  const spoken = !zh && /^[A-Z][a-z]+$/.test(name) ? name.toLowerCase() : name;
  const rawDesc = facts?.description || (zh ? `${name}嘅簡介` : `a clear look at ${spoken}`);
  const desc = zh ? zhHkCopy(rawDesc) : rawDesc;
  let sentences = dedupe(
    (facts?.sentences || []).map((s) => (zh ? zhHkCopy(s) : s)),
  );
  // Localize outline headings for zh-HK so script + scenes never keep Simplified.
  if (zh) {
    for (const beat of outline) {
      beat.heading = zhHkCopy(beat.heading);
    }
  }

  const pool = [...sentences];
  const take = (n = 1) => {
    const out = [];
    while (out.length < n && pool.length) out.push(pool.shift());
    return out;
  };

  const topicTitle = zh ? zhHkCopy(topic) : topic;
  const scriptParts = [`# ${topicTitle}`, ''];
  const scenes = {};

  for (const beat of outline) {
    if (beat.role === 'open') {
      const line = zh
        ? `[#hook] 今日用大概一分鐘講「${name}」。[#angle] 呢條片跟住「${intentLabel(intent, 'zh')}」嘅思路，講清楚重點——${desc}。`
        : `[#hook] Let's talk about ${spoken}. [#angle] This one-minute video follows a ${intentLabel(intent, 'en')} angle—${desc}.`;
      scriptParts.push(`## ${beat.id}`, line, '');
      scenes[beat.id] = {
        layout: 'title',
        title: name,
        subtitle:
          shortLabel(desc, zh ? 36 : 72, { zh, maxWords: 12 }) ||
          (zh ? '大約一分鐘講清楚' : 'About one minute'),
      };
      continue;
    }

    if (beat.role === 'close') {
      const midHeadings = outline.filter((b) => b.role === 'middle').map((b) => b.heading);
      const midNames = midHeadings.join(zh ? '、' : ' · ');
      const takeaway = midHeadings[0]
        ? zh
          ? `記住：${midHeadings.slice(0, 2).join('、')}`
          : `Remember: ${midHeadings.slice(0, 2).join(' · ')}`
        : name;
      const line = zh
        ? `[#close] 記住「${name}」：${midHeadings.join('、') || '幾個重點'}。[#thanks] 多謝收看。`
        : `[#close] Remember ${spoken} through ${midHeadings.join(', ') || 'these points'}. [#thanks] Thanks for watching.`;
      scriptParts.push(`## ${beat.id} {hold=1.5}`, line, '');
      scenes[beat.id] = {
        layout: 'title',
        title: shortLabel(takeaway, zh ? 32 : 64, { zh, maxWords: 12, keepList: true }) || name,
        subtitle: zh ? '多謝收看' : 'Thanks for watching',
      };
      continue;
    }

    // Middle beat — narration tied to this heading, not a generic template slot.
    const bits = take(2);
    while (bits.length < 2) {
      bits.push(
        zh
          ? `關於「${beat.heading}」，記住佢同「${name}」點樣扯上關係。`
          : `On ${beat.heading.toLowerCase()}, notice how it connects to ${spoken}.`,
      );
    }
    const narr = zh
      ? `[#point] ${beat.heading}。[#fact] ${ensureStop(bits[0], lang)} [#more] ${ensureStop(bits[1], lang)}`
      : `[#point] ${beat.heading}. [#fact] ${ensureStop(bits[0], lang)} [#more] ${ensureStop(bits[1], lang)}`;
    scriptParts.push(`## ${beat.id}`, narr, '');
    scenes[beat.id] = sceneForBeat(beat, bits, name, zh, intent);
  }

  return {
    script: scriptParts.join('\n').trim() + '\n',
    scenes,
    source: facts?.source || 'fallback',
    subject: name,
    intent,
    outline: outline.map((b) => ({ id: b.id, role: b.role, heading: b.heading, layout: b.layout })),
  };
}

function intentLabel(intent, lang) {
  const en = {
    definition: 'what-it-is',
    how: 'how-it-works',
    why: 'why-it-happens',
    history: 'where-it-came-from',
    compare: 'side-by-side',
    topic: 'topic',
  };
  const zhMap = {
    definition: '係咩',
    how: '點運作',
    why: '點解',
    history: '邊度嚟',
    compare: '對比',
    topic: '主題',
  };
  return lang === 'zh' ? zhMap[intent] || zhMap.topic : en[intent] || en.topic;
}

/**
 * Richer on-screen copy tied to narration cues.
 * Labels stay complete phrases (no mid-word cuts); canvas wraps longer lines.
 */
function sceneForBeat(beat, bits, name, zh, intent = 'topic') {
  const phrase = (t, max, words) => shortLabel(t, max, { zh, maxWords: words });
  // Prefer informative phrases: skip a tiny first clause like 「閏年」 alone.
  const screenBit = (raw, max, words) => {
    const cleaned = String(raw || '')
      // Drop English glosses that break Chinese card text: （英語：cat）
      .replace(/（[^）]*[A-Za-z][^）]*）/g, '')
      .replace(/\([^)]*[A-Za-z][^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return phrase(cleaned || raw, max, words);
  };
  let a = screenBit(bits[0], zh ? 36 : 80, zh ? 36 : 14);
  let b = screenBit(bits[1], zh ? 36 : 80, zh ? 36 : 14);
  const h = phrase(beat.heading, zh ? 24 : 48, zh ? 24 : 8) || String(beat.heading || '').trim();
  const hub = phrase(name, zh ? 20 : 40, zh ? 20 : 6) || String(name || '').trim();
  // If a clause opens mid-thought (「係指…」), put the subject back in front.
  const withHub = (t) => {
    if (!zh || !hub || !t) return t;
    if (/^(係|指|為|有|由|同|在|對)/u.test(t) && !t.includes(hub)) return `${hub}${t}`;
    return t;
  };
  a = withHub(a);
  b = withHub(b);
  const clauses = splitClauses(bits[0], zh);
  const c0 = withHub(screenBit(clauses[0] || bits[0], zh ? 32 : 72, zh ? 32 : 12));
  const c1 = withHub(screenBit(clauses[1] || bits[1] || clauses[0], zh ? 32 : 72, zh ? 32 : 12));
  const c2 = withHub(screenBit(clauses[2] || bits[1] || hub, zh ? 28 : 64, zh ? 28 : 10));

  switch (beat.layout) {
    case 'compare': {
      const leftTitle = phrase(c0 || h, zh ? 16 : 28, zh ? 16 : 5) || (zh ? '一面' : 'One side');
      const rightTitle = phrase(c1 || hub, zh ? 16 : 28, zh ? 16 : 5) || (zh ? '另一面' : 'Other side');
      return {
        layout: 'compare',
        left: {
          title: leftTitle,
          text: a || h,
          icon: 'book',
        },
        right: {
          title: rightTitle,
          text: b || hub,
          icon: 'sparkles',
        },
      };
    }
    case 'steps':
      return {
        layout: 'steps',
        cue: 'sentence',
        items: [
          { icon: 'search', text: h || (zh ? '先搞清楚問題' : 'Start with the problem'), marker: 'point' },
          { icon: 'lightbulb', text: a || c0 || (zh ? '關鍵一步' : 'Key step'), marker: 'fact' },
          { icon: 'list', text: b || c1 || (zh ? '跟住落去' : 'What follows'), marker: 'more' },
          { icon: 'check', text: c2 || hub || (zh ? '得出結果' : 'Land the result') },
        ].slice(0, 3),
      };
    case 'flow':
      return {
        layout: 'flow',
        cue: 'sentence',
        items: [
          {
            icon: 'search',
            text: h || (zh ? '見到咩現象' : 'What you notice'),
            marker: 'point',
          },
          {
            icon: intent === 'why' ? 'zap' : 'layers',
            text: a || (zh ? '背後原因' : 'The cause'),
            marker: 'fact',
          },
          {
            icon: 'check',
            text: b || (zh ? '跟住會點' : 'What follows'),
            marker: 'more',
          },
        ],
      };
    case 'title':
      return {
        layout: 'title',
        title: a || h || hub,
        subtitle: b || h || (zh ? '重點數字' : 'Key figure'),
      };
    case 'cards':
    default:
      return {
        layout: 'cards',
        cue: 'sentence',
        items: [
          { icon: 'layers', text: `${hub}${h && h !== hub ? ` · ${h}` : ''}`, marker: 'point' },
          { icon: 'book', text: a || c0 || (zh ? '核心定義' : 'Core idea'), marker: 'fact' },
          { icon: 'info', text: b || c1 || (zh ? '值得記住' : 'Worth keeping'), marker: 'more' },
        ],
      };
  }
}

/** Split a sentence into short clauses for card/step text. */
function splitClauses(text, zh) {
  const s = String(text || '').trim();
  if (!s) return [];
  if (zh) {
    return s
      .split(/[，、；：]/)
      .map((p) => p.replace(/[。！？]+$/u, '').trim())
      .filter(Boolean);
  }
  return s
    .split(/[,;:—–]/)
    .map((p) => p.replace(/[.!?]+$/u, '').trim())
    .filter(Boolean);
}

function dedupe(list) {
  const out = [];
  for (const s of list) {
    const t = String(s || '').trim();
    if (!t) continue;
    if (out.some((x) => x === t)) continue;
    out.push(t);
  }
  return out;
}
