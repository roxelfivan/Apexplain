/**
 * Autogenerate ~1 min script + scenes from a topic title.
 * Outline is chosen from title intent + Wikipedia sections (not a fixed template).
 * Layout pick follows explainroo `docs pictures`: which relationship does the
 * scene show — an order, a comparison, the parts of a whole, or a cause —
 * mapped onto Apexplain's declarative layouts.
 * zh-HK: Wikipedia zh + OpenCC cn→hk so script/scenes stay Traditional (HK).
 * Autogenerate tries Wikipedia for on-topic sentences (unless APEXPLAIN_OFFLINE=1),
 * then falls back to intent stubs that still name the subject. Make/TTS stay local.
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
    .replace(/^why\s+/i, '')
    .replace(/^(explain|about|intro(?:duction)?\s+to)\s+/i, '')
    .replace(
      /^(什麼是|什么是|邊個係|边个係|點解有|点解有|點解會|点解会|點解|点解|點樣|点样|如何|簡介|简介)\s*/u,
      '',
    )
    .replace(/[?？！!。.]+$/u, '')
    // "vaccines work" / "leap years exist" → core noun phrase
    .replace(
      /\s+(work|works|working|exist|exists|happen|happens|occur|occurs|mean|means)\s*$/i,
      '',
    )
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
  // Make/TTS stay local; Autogenerate may use Wikipedia for topic facts.
  if (process.env.APEXPLAIN_OFFLINE === '1') return null;
  if (lang === 'zh-HK') {
    const zhTitle = await resolveZhTitle(subject);
    if (zhTitle) {
      const hit = await wikiBundle('zh', zhTitle, subject);
      if (hit?.sentences?.length) return hit;
    }
    for (const q of uniqueQueries(subject, 'zh-HK')) {
      const hit = await wikiBundle('zh', q, subject);
      if (hit?.sentences?.length && !/^[A-Za-z0-9]/.test(hit.extract || '')) return hit;
    }
    for (const q of uniqueQueries(subject, 'en')) {
      const hit = await wikiBundle('en', q, subject);
      if (hit?.sentences?.length) return hit;
    }
    return null;
  }
  for (const q of uniqueQueries(subject, 'en')) {
    const hit = await wikiBundle('en', q, subject);
    if (hit?.sentences?.length) return hit;
  }
  return null;
}

/** Reject Wikipedia pages that drifted away from the subject (e.g. VFC for "vaccines"). */
function pageRelevant(pageTitle, subject) {
  const page = normalizeHeading(pageTitle);
  const sub = normalizeHeading(subject);
  if (!page || !sub) return false;
  if (page === sub || page === singularize(sub) || singularize(page) === sub) return true;
  if (page.includes(sub) || sub.includes(page)) {
    // "Vaccines for Children Program" contains "vaccines" but is not the topic page.
    if (
      /\b(program|programme|act|agency|department|ministry|committee|project|initiative)\b/i.test(
        pageTitle,
      ) &&
      sub.split(/\s+/).length <= 2
    ) {
      return false;
    }
    return true;
  }
  const pt = new Set(page.split(/\s+/).filter((w) => w.length > 2));
  const st = sub.split(/\s+/).filter((w) => w.length > 2);
  if (!st.length) return true;
  const hit = st.filter((w) => pt.has(w) || page.includes(w)).length;
  return hit / st.length >= 0.6 && page.split(/\s+/).length <= st.length + 2;
}

function singularize(s) {
  const t = String(s || '');
  if (/ies$/i.test(t)) return t.replace(/ies$/i, 'y');
  if (/ses$/i.test(t)) return t.replace(/ses$/i, 's');
  if (/s$/i.test(t) && !/ss$/i.test(t)) return t.replace(/s$/i, '');
  return t;
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
    const bare = subject.replace(/^(an?|the)\s+/i, '');
    push(bare);
    push(bare.replace(/\s+/g, '_'));
    // "vaccines" → "vaccine", "leap years" stays
    if (/ies$/i.test(bare)) push(bare.replace(/ies$/i, 'y'));
    else if (/ses$/i.test(bare)) push(bare.replace(/ses$/i, 's'));
    else if (/s$/i.test(bare) && !/ss$/i.test(bare)) push(bare.replace(/s$/i, ''));
  }
  return out;
}

async function wikiBundle(wiki, title, subjectForFilter = title) {
  const candidates = await wikiSearchCandidates(wiki, title, 5);
  const tryTitles = candidates.length ? candidates : [title];
  let summary = null;
  let pageTitle = title;
  for (const cand of tryTitles) {
    const hit = await wikiSummary(wiki, cand);
    if (!hit?.sentences?.length) continue;
    if (!pageRelevant(hit.pageTitle || cand, subjectForFilter)) continue;
    summary = hit;
    pageTitle = hit.pageTitle || cand;
    break;
  }
  if (!summary) return null;
  const sections = await wikiSections(wiki, pageTitle);
  const sectionFacts = await wikiSectionFacts(wiki, pageTitle, sections.slice(0, 6));
  // Prefer lead + section sentences so middle beats have real topic copy.
  const merged = dedupe([
    ...(summary.sentences || []),
    ...sectionFacts.flatMap((s) => s.sentences || []),
  ]).slice(0, 24);
  return {
    ...summary,
    sentences: merged.length ? merged : summary.sentences,
    sections,
    sectionFacts,
    wiki,
  };
}

/**
 * Plain-text extracts for top sections (for beat-matched narration).
 */
async function wikiSectionFacts(wiki, title, headings) {
  if (!headings?.length) return [];
  const params = {
    action: 'query',
    prop: 'extracts',
    explaintext: '1',
    exsectionformat: 'wiki',
    redirects: '1',
    titles: title,
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
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const page = Object.values(data?.query?.pages || {})[0];
    let extract = String(page?.extract || '');
    if (!extract) return [];
    if (wiki === 'zh') extract = toTradHk(extract);
    const lang = wiki === 'zh' ? 'zh' : 'en';
    const blocks = splitWikiSections(extract);
    const want = new Set(headings.map((h) => normalizeHeading(h)));
    const out = [];
    for (const block of blocks) {
      const key = normalizeHeading(block.heading);
      if (!want.has(key) && !headings.some((h) => key.includes(normalizeHeading(h)) || normalizeHeading(h).includes(key))) {
        continue;
      }
      const sentences = splitSentences(block.text, lang).slice(0, 4);
      if (!sentences.length) continue;
      out.push({
        heading: wiki === 'zh' ? toTradHk(block.heading) : block.heading,
        sentences,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function normalizeHeading(h) {
  return String(h || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, ' ')
    .trim();
}

/** Split explaintext dump on == Heading == lines. */
function splitWikiSections(extract) {
  const text = String(extract || '');
  const parts = text.split(/\n(?==+[^=].*[^=]=+\s*\n)/);
  const blocks = [];
  for (const part of parts) {
    const m = part.match(/^(=+)\s*([^=]+?)\s*\1\s*\n?([\s\S]*)$/);
    if (!m) {
      // Lead paragraph(s) before first heading.
      if (!blocks.length && part.trim()) {
        blocks.push({ heading: 'Lead', text: part.trim() });
      }
      continue;
    }
    const heading = m[2].replace(/<[^>]+>/g, '').trim();
    const body = m[3].trim();
    if (!heading || SKIP_SECTIONS.test(heading) || !body) continue;
    blocks.push({ heading, text: body });
  }
  return blocks;
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
  const hits = await wikiSearchCandidates(wiki, query, 1);
  return hits[0] || null;
}

async function wikiSearchCandidates(wiki, query, limit = 5) {
  const url =
    `https://${wiki}.wikipedia.org/w/api.php?` +
    new URLSearchParams({
      action: 'opensearch',
      search: query,
      limit: String(limit),
      namespace: '0',
      format: 'json',
    });
  const res = await fetch(url, {
    headers: { 'user-agent': WIKI_UA, accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.[1] || []).map((h) => String(h)).filter(Boolean);
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

/**
 * Explainer beats from intent + subject — not Wikipedia's TOC
 * (Etymology / Taxonomy / Program history feel "standard", not topic-sensible).
 * Wikipedia only supplies facts later in buildFromOutline.
 */
export function planOutline({ intent, topic, subject, facts, lang }) {
  const page =
    facts?.pageTitle && pageRelevant(facts.pageTitle, subject) ? facts.pageTitle : null;
  // Open title can use the wiki page name; middle headings use a natural phrase.
  const openName = page || subject;
  const phraseName = headingPhrase(subject, page, lang);
  const middles = topicMiddles(intent, phraseName, lang);

  const used = new Set(['open', 'close']);
  const middleBeats = middles.map((row, i) => {
    const heading = row.heading;
    return {
      id: slugSceneId(heading, used),
      role: 'middle',
      heading,
      layout: layoutFor(intent, heading, i),
      factHints: row.hints || [],
    };
  });

  return [
    {
      id: 'open',
      role: 'open',
      heading: openName,
      layout: 'title',
    },
    ...middleBeats,
    {
      id: 'close',
      role: 'close',
      heading: lang === 'zh-HK' ? '總結' : 'Takeaway',
      layout: 'title',
    },
  ];
}

/** Natural noun phrase for scene headings ("a cat", "leap years", "vaccines"). */
function headingPhrase(subject, pageTitle, lang) {
  if (lang === 'zh-HK') return pageTitle || subject;
  const s = String(subject || pageTitle || 'this topic').trim();
  if (!s) return 'this topic';
  const lower = s.toLowerCase();
  if (/^(a|an|the)\s/i.test(lower)) return lower;
  if (/^[a-z]+$/i.test(lower)) {
    // Plural nouns already: vaccines, cats — don't say "a vaccines".
    if (looksPlural(lower)) return lower;
    return `a ${lower}`;
  }
  return lower;
}

function looksPlural(word) {
  const w = String(word || '');
  if (/ss$/i.test(w) || /us$/i.test(w) || /is$/i.test(w) || /news$/i.test(w)) return false;
  return /s$/i.test(w);
}

function verbAgree(name, singular, plural) {
  const n = String(name || '');
  if (/^a\s/i.test(n)) return singular;
  if (/\s/.test(n) || looksPlural(n)) return plural;
  return singular;
}

/** Topic-shaped middle scenes for a ~1 min explainer. */
export function topicMiddles(intent, name, lang) {
  const zh = lang === 'zh-HK';
  const n = String(name || (zh ? '呢個主題' : 'this topic')).trim();
  switch (intent) {
    case 'definition':
      return zh
        ? [
            { heading: `${n}係咩`, hints: ['定義', '概述', '特徵', 'biology', 'description', 'domestic'] },
            { heading: `${n}嘅特點`, hints: ['特徵', '結構', '行為', 'traits', 'behavior', 'intelligence'] },
            { heading: `同生活嘅關係`, hints: ['用途', '文化', '人類', 'ecology', 'human', 'domestication'] },
          ]
        : [
            { heading: `What ${n} is`, hints: ['biology', 'description', 'overview', 'domestic', 'species', 'mammal'] },
            { heading: `What makes ${n} distinct`, hints: ['traits', 'behavior', 'anatomy', 'intelligence', 'family'] },
            { heading: `Where you meet ${n}`, hints: ['culture', 'human', 'ecology', 'domestication', 'farmers', 'pet'] },
          ];
    case 'how':
      return zh
        ? [
            { heading: `要解決咩問題`, hints: ['問題', '背景', 'problem', 'disease', 'infection'] },
            { heading: `${n}點運作`, hints: ['步驟', '原理', '機制', 'process', 'mechanism', 'immune'] },
            { heading: `得出咩結果`, hints: ['結果', '效果', 'result', 'effect', 'protect'] },
          ]
        : [
            {
              heading: `The problem ${n} ${verbAgree(n, 'addresses', 'address')}`,
              hints: ['problem', 'disease', 'infection', 'immune', 'pathogen'],
            },
            {
              heading: `How ${n} ${verbAgree(n, 'works', 'work')}`,
              hints: ['process', 'mechanism', 'immune', 'antigen', 'antibody', 'response'],
            },
            { heading: `What protection you get`, hints: ['result', 'effect', 'immunity', 'protect', 'prevent'] },
          ];
    case 'why':
      return zh
        ? [
            { heading: `見到咩現象`, hints: ['現象', '問題', 'calendar', 'year', 'day'] },
            { heading: `點解會咁`, hints: ['原因', '原理', 'orbit', 'earth', 'sun', '365'] },
            { heading: `跟住會點`, hints: ['影響', '後果', 'february', 'gregorian', 'calendar'] },
          ]
        : [
            { heading: `What seems odd about ${n}`, hints: ['calendar', 'year', 'day', 'february', 'common year'] },
            {
              heading: `Why ${n} ${verbAgree(n, 'happens', 'happen')}`,
              hints: ['orbit', 'earth', 'sun', '365', 'fraction', 'corrective'],
            },
            { heading: `What that changes`, hints: ['february', '29', 'gregorian', 'calendar', 'day'] },
          ];
    case 'history':
      return zh
        ? [
            { heading: `${n}點開始`, hints: ['起源', '發明', 'origin', 'history'] },
            { heading: `中間點變`, hints: ['發展', '變化', 'evolution'] },
            { heading: `而家點樣`, hints: ['現代', '今天', 'today'] },
          ]
        : [
            { heading: `Where ${n} began`, hints: ['origin', 'history', 'invention'] },
            { heading: `How ${n} changed`, hints: ['evolution', 'development', 'change'] },
            { heading: `${n} today`, hints: ['modern', 'today', 'current'] },
          ];
    case 'compare':
      return zh
        ? [
            { heading: `兩邊差喺邊`, hints: ['對比', '分別', 'difference', 'versus'] },
            { heading: `邊種情況更啱`, hints: ['選擇', '用途', 'when', 'choose'] },
          ]
        : [
            { heading: `How the sides differ`, hints: ['difference', 'versus', 'compare'] },
            { heading: `When to pick which`, hints: ['choose', 'when', 'use'] },
          ];
    default:
      return zh
        ? [
            { heading: `${n}概況`, hints: ['概述', '定義', 'overview'] },
            { heading: `值得記住`, hints: ['重點', '特徵', 'key'] },
            { heading: `實際例子`, hints: ['例子', '用途', 'example', 'use'] },
          ]
        : [
            { heading: `The idea behind ${n}`, hints: ['overview', 'definition', 'idea'] },
            { heading: `What to notice`, hints: ['key', 'trait', 'important'] },
            { heading: `A concrete example`, hints: ['example', 'use', 'case'] },
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
  const rawName =
    facts?.pageTitle && pageRelevant(facts.pageTitle, subject) ? facts.pageTitle : subject;
  const name = zh ? zhHkCopy(rawName) : rawName;
  // Short spoken subject ("cat", "leap years") — not the full question title.
  const core = zh ? name : String(subject || name).trim();
  const spoken = !zh && /^[A-Z][a-z]+$/.test(core) ? core.toLowerCase() : core;
  const spokenHook =
    !zh && spoken && !/^(a|an|the)\s/i.test(spoken) && !/\s/.test(spoken) && !looksPlural(spoken)
      ? `the ${spoken}`
      : spoken;

  const sectionFacts = (facts?.sectionFacts || []).map((sf) => ({
    heading: zh ? zhHkCopy(sf.heading) : sf.heading,
    sentences: dedupe((sf.sentences || []).map((s) => (zh ? zhHkCopy(s) : s))),
  }));
  const leadSentences = dedupe(
    (facts?.sentences || []).map((s) => (zh ? zhHkCopy(s) : s)),
  );
  const allFacts = dedupe([
    ...leadSentences,
    ...sectionFacts.flatMap((sf) => sf.sentences || []),
  ]);

  const rawDesc =
    facts?.description ||
    leadSentences[0] ||
    (zh ? `${name}嘅簡介` : `what ${spokenHook} is and why it matters`);
  const desc = zh ? zhHkCopy(rawDesc) : rawDesc;

  if (zh) {
    for (const beat of outline) {
      beat.heading = zhHkCopy(beat.heading);
    }
  }

  const used = new Set();
  const takeFrom = (list, n = 1) => {
    const out = [];
    for (const s of list || []) {
      if (out.length >= n) break;
      if (used.has(s)) continue;
      used.add(s);
      out.push(s);
    }
    return out;
  };

  const bitsForBeat = (beat) => {
    const hints = [...(beat.factHints || []), beat.heading, subject, name];
    const ranked = allFacts
      .filter((s) => !used.has(s))
      .map((s) => ({ s, score: scoreFactForBeat(s, hints) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    let bits = takeFrom(
      ranked.map((r) => r.s),
      2,
    );
    // Section bodies that match hints.
    if (bits.length < 2) {
      for (const sf of sectionFacts) {
        if (bits.length >= 2) break;
        const h = normalizeHeading(sf.heading);
        const ok = hints.some((hint) => {
          const k = normalizeHeading(hint);
          return k && (h.includes(k) || k.includes(h));
        });
        if (!ok) continue;
        bits = bits.concat(takeFrom(sf.sentences, 2 - bits.length));
      }
    }
    if (bits.length < 2) bits = bits.concat(takeFrom(leadSentences, 2 - bits.length));
    if (bits.length < 2) {
      bits = bits.concat(
        stubLinesForBeat({ beat, name, spoken, intent, lang }).slice(0, 2 - bits.length),
      );
    }
    return bits.slice(0, 2);
  };

  const topicTitle = zh ? zhHkCopy(topic) : topic;
  const scriptParts = [`# ${topicTitle}`, ''];
  const scenes = {};

  for (const beat of outline) {
    if (beat.role === 'open') {
      const hookFact = takeFrom(leadSentences, 1)[0];
      const line = zh
        ? `[#hook] 今日用大概一分鐘講「${name}」。[#angle] ${
            hookFact
              ? ensureStop(hookFact, lang)
              : `我哋會用「${intentLabel(intent, 'zh')}」嘅角度，講清楚重點。`
          }`
        : `[#hook] Let's talk about ${spokenHook}. [#angle] ${
            hookFact
              ? ensureStop(hookFact, lang)
              : `In about a minute we'll unpack ${spokenHook} clearly.`
          }`;
      scriptParts.push(`## ${beat.id}`, line, '');
      scenes[beat.id] = {
        layout: 'title',
        title: name,
        subtitle:
          shortLabel(hookFact || desc, zh ? 36 : 72, { zh, maxWords: 12 }) ||
          (zh ? '大約一分鐘講清楚' : 'About one minute'),
      };
      continue;
    }

    if (beat.role === 'close') {
      const midHeadings = outline.filter((b) => b.role === 'middle').map((b) => b.heading);
      const takeaway = midHeadings[0]
        ? zh
          ? `記住：${midHeadings.slice(0, 2).join('、')}`
          : `Remember: ${midHeadings.slice(0, 2).join(' · ')}`
        : name;
      const line = zh
        ? `[#close] 記住「${name}」：${midHeadings.join('、') || '幾個重點'}。[#thanks] 多謝收看。`
        : `[#close] So for ${spokenHook}, hold onto ${
            midHeadings.slice(0, 2).join(' and ') || 'these beats'
          }. [#thanks] Thanks for watching.`;
      scriptParts.push(`## ${beat.id} {hold=1.5}`, line, '');
      scenes[beat.id] = {
        layout: 'title',
        title: shortLabel(takeaway, zh ? 32 : 64, { zh, maxWords: 12, keepList: true }) || name,
        subtitle: zh ? '多謝收看' : 'Thanks for watching',
      };
      continue;
    }

    // Middle: topic heading + facts matched to this beat (not a wiki TOC dump).
    const bits = bitsForBeat(beat);
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

function scoreFactForBeat(sentence, hints) {
  const s = normalizeHeading(sentence);
  if (!s) return 0;
  let score = 0;
  for (const hint of hints || []) {
    const k = normalizeHeading(hint);
    if (!k || k.length < 2) continue;
    if (s.includes(k)) score += k.length > 6 ? 3 : 2;
    for (const tok of k.split(/\s+/)) {
      if (tok.length > 3 && s.includes(tok)) score += 1;
    }
  }
  return score;
}

/** Offline / thin-wiki fallback that still talks about the subject. */
function stubLinesForBeat({ beat, name, spoken, intent, lang }) {
  const zh = lang === 'zh-HK';
  const n = zh ? name : spoken;
  const h = String(beat.heading || '').trim();
  if (zh) {
    switch (intent) {
      case 'definition':
        return [
          `簡單嚟講，「${n}」就係大家日常會聽到、但未必講得清嘅概念。`,
          `捉住「${h}」呢一點，成個主題就會清楚好多。`,
        ];
      case 'how':
        return [
          `要明白「${n}」，先要睇清楚過程入面嘅關鍵一步。`,
          `跟住呢個次序，就解釋到「${n}」點樣得出結果。`,
        ];
      case 'why':
        return [
          `點解要搞「${n}」？通常係為咗修正一個容易忽略嘅偏差。`,
          `明白呢個原因，就知「${n}」點解出現喺日曆同生活入面。`,
        ];
      case 'history':
        return [
          `「${n}」唔係一開始就係而家咁，而係一步步演變出嚟。`,
          `睇清楚轉變，先會明而家點樣用「${n}」。`,
        ];
      case 'compare':
        return [
          `比較嘅時候，最緊要分清兩邊差喺邊。`,
          `分得清，先會知邊種情況更啱用「${n}」。`,
        ];
      default:
        return [
          `講「${n}」，先記住最核心嗰兩個重點就夠。`,
          `有咗呢啲錨點，之後再加細節都唔會亂。`,
        ];
    }
  }
  switch (intent) {
    case 'definition':
      return [
        `${capitalize(n)} is a real-world thing people name often but rarely define cleanly.`,
        `This beat focuses on ${h.toLowerCase()} so the rest of the story has a solid anchor.`,
      ];
    case 'how':
      return [
        `${capitalize(n)} only makes sense if you see the process in order.`,
        `Walk the steps under “${h}”, and the outcome stops feeling like magic.`,
      ];
    case 'why':
      return [
        `${capitalize(n)} exists to fix a mismatch that builds up if you ignore it.`,
        `Once you see that cause, “${h.toLowerCase()}” is the natural next beat.`,
      ];
    case 'history':
      return [
        `${capitalize(n)} did not arrive fully formed — it changed across time.`,
        `Those shifts still explain how people use ${n} today.`,
      ];
    case 'compare':
      return [
        `The useful move is to split ${n} into clear sides, not vague vibes.`,
        `With that contrast, you can choose which side fits the moment.`,
      ];
    default:
      return [
        `Start with the core idea behind ${n}, then add only the details that earn their place.`,
        `If you can explain “${h.toLowerCase()}” in one breath, you understand the topic.`,
      ];
  }
}

function capitalize(s) {
  const t = String(s || '');
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
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
