/**
 * Autogenerate ~1 min script + scenes from a topic title.
 * Outline is chosen from title intent (not a fixed Wikipedia TOC).
 * Copy comes from the Settings LLM (local Gemma or MiniMax). Stubs only when
 * APEXPLAIN_LLM=mock. Layout pick follows explainroo `docs pictures`.
 * zh-HK: Traditional Chinese (HK) on-screen and in the prompt.
 */
import { completeChat, llmReady } from './llm/complete.js';
import { loadLlmSettings } from './llm/config.js';
import { parseLlmExplainer } from './llm/parse.js';
import { ApexError } from './errors.js';
import { buildAutogenerateSystemPrompt } from './skill-guidance.js';
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

function useStubLlm() {
  return process.env.APEXPLAIN_LLM === 'mock';
}

/** Strip HTML comments; empty / template-only storyboards count as inactive. */
export function normalizeStoryboard(text) {
  return String(text || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
}

export function storyboardIsActive(text) {
  const s = normalizeStoryboard(text);
  if (!s) return false;
  const lines = s
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const substantive = lines.filter((l) => !/^#\s*(Storyboard|分鏡)\b/i.test(l));
  return substantive.length > 0;
}

/**
 * Build outline beats from ## headings in storyboard.md.
 * Returns null when there are no ## scene headings (caller keeps planOutline).
 */
export function outlineFromStoryboard(text, { intent, subject, lang } = {}) {
  const s = normalizeStoryboard(text);
  if (!s) return null;
  const blocks = [];
  const parts = s.split(/^##\s+/m);
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const nl = block.indexOf('\n');
    const headingLine = (nl === -1 ? block : block.slice(0, nl)).trim();
    const body = (nl === -1 ? '' : block.slice(nl + 1)).trim();
    if (!headingLine) continue;
    blocks.push({ headingLine, body });
  }
  if (!blocks.length) return null;

  const used = new Set();
  return blocks.map((b, i) => {
    // Prefer an explicit scene id token: "## open — Hook" or "## open"
    const idMatch = b.headingLine.match(/^([A-Za-z0-9][A-Za-z0-9_-]*)\b/);
    let id = idMatch ? idMatch[1].toLowerCase() : null;
    let heading = b.headingLine;
    if (idMatch && /^[A-Za-z0-9][A-Za-z0-9_-]*\s*[—–:\-]\s+/.test(b.headingLine)) {
      heading = b.headingLine.replace(/^[A-Za-z0-9][A-Za-z0-9_-]*\s*[—–:\-]\s+/, '').trim() || b.headingLine;
    } else if (idMatch && b.headingLine === idMatch[1]) {
      heading = idMatch[1];
    }
    if (!id || used.has(id) || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
      id = slugSceneId(heading, used);
    } else {
      used.add(id);
    }
    const role =
      i === 0 ? 'open' : i === blocks.length - 1 && blocks.length > 1 ? 'close' : 'middle';
    const relation = role === 'open' || role === 'close' ? 'hook' : sceneRelation(intent || 'topic', heading);
    const layout =
      role === 'open' || role === 'close' ? 'title' : layoutFor(intent || 'topic', heading, i);
    return {
      id,
      role,
      heading,
      relation,
      layoutHints: role === 'open' || role === 'close' ? ['title'] : layoutHintsFor(relation),
      // Fallback for stub/mock only — LLM should pick from layoutHints by beat content.
      layout,
      factHints: b.body
        ? b.body
            .split(/\n+/)
            .map((l) => l.replace(/^[-*]\s+/, '').trim())
            .filter(Boolean)
            .slice(0, 6)
        : [],
      notes: b.body || '',
    };
  });
}

/**
 * How many middle scenes to plan for a target finished length.
 * Open+close ≈ 14s; each middle ≈ 12s of finished video (cap 12).
 */
export function middleCountForTarget(targetSeconds) {
  const t = Number(targetSeconds);
  if (!Number.isFinite(t) || t < 15) return 3;
  return Math.max(1, Math.min(12, Math.round((Math.min(600, t) - 14) / 12)));
}

/** Spoken sentences per middle beat — denser for longer targets. */
export function sentencesPerMiddle(targetSeconds) {
  const t = Number(targetSeconds);
  if (!Number.isFinite(t) || t < 15) return 2;
  if (t >= 240) return 6;
  if (t >= 150) return 5;
  if (t >= 90) return 4;
  if (t >= 60) return 3;
  return 2;
}

/**
 * LLM output token budget so script.md + scenes.json are not truncated.
 * Local Gemma used to hard-cap at 1600, which starved longer targets.
 */
export function llmMaxOutputTokens(targetSeconds) {
  const t = Number(targetSeconds);
  const secs = Number.isFinite(t) && t >= 15 ? Math.min(600, t) : 60;
  // ~55 tokens per finished second covers narration + scenes JSON overhead.
  return Math.max(2400, Math.min(16384, Math.round(secs * 55)));
}

/**
 * Hard content quotas for the first Autogenerate draft.
 * When the outline has fewer middles than expected (storyboard), densify per beat.
 */
export function contentQuota(targetSeconds, lang = 'en', { middleCount = null } = {}) {
  const n = Number(targetSeconds);
  if (!Number.isFinite(n) || n < 15) {
    return {
      target: null,
      lo: 45,
      hi: 90,
      expectedMiddles: 3,
      middleCount: middleCount ?? 3,
      openSentences: 2,
      closeSentences: 2,
      perMiddle: 2,
      words: null,
      chars: null,
      unit: lang === 'zh-HK' ? 'chars' : 'words',
      amount: null,
    };
  }
  const t = Math.round(Math.min(600, Math.max(15, n)));
  const expectedMiddles = middleCountForTarget(t);
  const middles = Math.max(1, Number(middleCount) || expectedMiddles);
  let perMiddle = sentencesPerMiddle(t);
  if (middles < expectedMiddles) {
    perMiddle = Math.min(6, perMiddle + Math.ceil((expectedMiddles - middles) * 0.75));
  }
  const openSentences = t >= 90 ? 3 : 2;
  const closeSentences = t >= 90 ? 3 : 2;
  // Ask for ~75% speech so the draft lands near target after lead/hold.
  const speechSecs = t * 0.75;
  const words = Math.round(speechSecs * 2.5);
  const chars = Math.round(speechSecs * 4.0);
  return {
    target: t,
    lo: Math.round(t * 0.85),
    hi: Math.round(t * 1.15),
    expectedMiddles,
    middleCount: middles,
    openSentences,
    closeSentences,
    perMiddle,
    words,
    chars,
    unit: lang === 'zh-HK' ? 'chars' : 'words',
    amount: lang === 'zh-HK' ? chars : words,
  };
}

/** Min spoken sentences for one outline beat given the quota. */
export function minSentencesForBeat(role, quota) {
  if (!quota) return 2;
  if (role === 'open') return quota.openSentences;
  if (role === 'close') return quota.closeSentences;
  return quota.perMiddle;
}

/** Min spoken words/chars for one beat so the total hits the speech budget. */
export function minUnitsForBeat(role, quota) {
  if (!quota?.amount) return role === 'middle' ? 40 : 25;
  const middles = Math.max(1, quota.middleCount || 3);
  // Middles carry most of the length; open/close share the rest.
  const middleShare = 0.78;
  const edgeShare = (1 - middleShare) / 2;
  if (role === 'open' || role === 'close') {
    return Math.max(18, Math.round(quota.amount * edgeShare));
  }
  return Math.max(28, Math.round((quota.amount * middleShare) / middles));
}

/** Rough speech budget for Autogenerate from video.json targetSeconds. */
export function lengthGuidance(targetSeconds, lang = 'en', { middleCount = null } = {}) {
  const q = contentQuota(targetSeconds, lang, { middleCount });
  if (!q.target) {
    return (
      'HARD: write enough speech for about 45–90 seconds. ' +
      'Each middle scene needs at least 2–3 full spoken sentences with substance — not one-liners.'
    );
  }
  if (lang === 'zh-HK') {
    return (
      `HARD length requirement：finished video ≈${q.target}s（接受 ${q.lo}–${q.hi}s）。` +
      `必須寫齊 outline 全部 ## scenes。Open ≥${q.openSentences} 句，每個 middle ≥${q.perMiddle} 句，close ≥${q.closeSentences} 句。` +
      `總口白至少 ≈${q.chars} 中文字。每個 beat 要達到 outline 入面嘅 minChars。` +
      `短過預算就當失敗——唔好寫成短片 stub。`
    );
  }
  return (
    `HARD length requirement: finished video ≈${q.target}s (accept ${q.lo}–${q.hi}s). ` +
    `You MUST write every ## scene in the outline. Open ≥${q.openSentences} sentences, each middle ≥${q.perMiddle}, close ≥${q.closeSentences}. ` +
    `Total spoken at least ≈${q.words} English words. Hit each beat's minWords. ` +
    `A short stub (~45s / thin one-liners) is a failed response when the target is longer.`
  );
}

/** Fill-in skeleton so the model expands every beat instead of skipping. */
export function scriptSkeleton(outline, quota, lang = 'en') {
  const zh = lang === 'zh-HK';
  const lines = ['# {{title}}', ''];
  for (const beat of outline || []) {
    const n = minSentencesForBeat(beat.role, quota);
    const units = minUnitsForBeat(beat.role, quota);
    const unitLabel = zh ? '字' : 'words';
    lines.push(`## ${beat.id}`);
    lines.push(
      zh
        ? `（寫至少 ${n} 句有內容口白，約 ${units}${unitLabel}；標題：${beat.heading}）`
        : `(Write at least ${n} substantive spoken sentences, ~${units} ${unitLabel}; heading: ${beat.heading})`,
    );
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}

/**
 * Trim or expand middle beat list to match target length.
 * Extra beats reuse intent-shaped templates with unique headings.
 */
export function scaleMiddles(middles, count, { intent, name, lang } = {}) {
  const want = Math.max(1, Math.min(12, Number(count) || 3));
  const base = Array.isArray(middles) ? middles.filter(Boolean) : [];
  if (base.length === want) return base;
  if (base.length > want) return base.slice(0, want);
  const extras = extraMiddleTemplates(intent, name, lang);
  const out = [...base];
  const used = new Set(out.map((m) => String(m.heading || '').toLowerCase()));
  let i = 0;
  while (out.length < want) {
    const tmpl = extras[i % Math.max(1, extras.length)] || {
      heading: lang === 'zh-HK' ? `重點 ${out.length}` : `Key point ${out.length}`,
      hints: ['key', 'detail'],
    };
    let heading = tmpl.heading;
    let n = 2;
    while (used.has(String(heading).toLowerCase())) {
      heading = lang === 'zh-HK' ? `${tmpl.heading}（${n}）` : `${tmpl.heading} (${n})`;
      n += 1;
    }
    used.add(String(heading).toLowerCase());
    out.push({ heading, hints: tmpl.hints || [] });
    i += 1;
  }
  return out;
}

function extraMiddleTemplates(intent, name, lang) {
  const zh = lang === 'zh-HK';
  const n = String(name || (zh ? '呢個主題' : 'this topic')).trim();
  if (zh) {
    return [
      { heading: `${n}常見誤解`, hints: ['誤解', 'myth', 'wrong'] },
      { heading: `一個具體例子`, hints: ['例子', 'example', 'case'] },
      { heading: `實際應用`, hints: ['應用', 'use', 'practice'] },
      { heading: `要注意咩`, hints: ['注意', 'caveat', 'limit'] },
      { heading: `點樣記得住`, hints: ['記憶', 'remember', 'summary'] },
    ];
  }
  switch (intent) {
    case 'how':
      return [
        { heading: `A concrete walkthrough`, hints: ['example', 'walkthrough', 'case'] },
        { heading: `Common mistakes`, hints: ['mistake', 'pitfall', 'wrong'] },
        { heading: `What to check next`, hints: ['check', 'next', 'verify'] },
        { heading: `Limits of ${n}`, hints: ['limit', 'caveat', 'edge'] },
      ];
    case 'why':
      return [
        { heading: `A clear example`, hints: ['example', 'case', 'illustration'] },
        { heading: `What people mix up`, hints: ['myth', 'mistake', 'confusion'] },
        { heading: `Side effects in practice`, hints: ['effect', 'practice', 'result'] },
        { heading: `How to remember it`, hints: ['remember', 'summary', 'anchor'] },
      ];
    case 'history':
      return [
        { heading: `A turning point`, hints: ['turning', 'shift', 'milestone'] },
        { heading: `What stuck around`, hints: ['legacy', 'today', 'remain'] },
        { heading: `Myths along the way`, hints: ['myth', 'story', 'wrong'] },
        { heading: `Why it still matters`, hints: ['matter', 'today', 'relevance'] },
      ];
    case 'compare':
      return [
        { heading: `Trade-offs in practice`, hints: ['tradeoff', 'cost', 'benefit'] },
        { heading: `A decision checklist`, hints: ['checklist', 'choose', 'decision'] },
        { heading: `Edge cases`, hints: ['edge', 'exception', 'limit'] },
      ];
    case 'definition':
      return [
        { heading: `A concrete example of ${n}`, hints: ['example', 'case', 'instance'] },
        { heading: `What ${n} is not`, hints: ['not', 'myth', 'contrast'] },
        { heading: `How people use ${n}`, hints: ['use', 'practice', 'human'] },
        { heading: `One thing worth remembering`, hints: ['remember', 'key', 'summary'] },
      ];
    default:
      return [
        { heading: `A concrete example`, hints: ['example', 'case', 'use'] },
        { heading: `What to avoid`, hints: ['avoid', 'mistake', 'pitfall'] },
        { heading: `How it shows up in practice`, hints: ['practice', 'real', 'apply'] },
        { heading: `One memorable takeaway`, hints: ['takeaway', 'remember', 'key'] },
      ];
  }
}

export function buildExplainerMessages({
  topic,
  subject,
  intent,
  outline,
  lang = 'en',
  storyboard = '',
  targetSeconds = null,
}) {
  const zh = lang === 'zh-HK';
  const boardActive = storyboardIsActive(storyboard);
  const boardText = boardActive ? normalizeStoryboard(storyboard) : '';
  const middleCount = (outline || []).filter((b) => b.role === 'middle').length;
  const quota = contentQuota(targetSeconds, lang, { middleCount });
  const length = lengthGuidance(targetSeconds, lang, { middleCount });
  const unitKey = quota.unit === 'chars' ? 'minChars' : 'minWords';
  const beats = (outline || []).map((b) => ({
    id: b.id,
    role: b.role,
    heading: b.heading,
    relation: b.relation,
    layoutHints: b.layoutHints || layoutHintsFor(b.relation || 'other'),
    minSentences: minSentencesForBeat(b.role, quota),
    [unitKey]: minUnitsForBeat(b.role, quota),
    notes: b.notes || undefined,
  }));
  const system = buildAutogenerateSystemPrompt({
    lang,
    boardActive,
    targetSeconds,
    lengthHint: length,
  });
  const tSec = Number(targetSeconds);
  const target =
    Number.isFinite(tSec) && tSec >= 15 ? Math.round(Math.min(600, tSec)) : null;
  const spokenLabel =
    quota.amount != null ? `~${quota.amount} ${quota.unit}` : 'enough speech for 45–90s';
  const payload = {
    title: topic,
    subject,
    intent,
    lang: zh ? 'zh-HK' : 'en',
    targetSeconds: target,
    length,
    contentQuota: {
      openSentences: quota.openSentences,
      perMiddle: quota.perMiddle,
      closeSentences: quota.closeSentences,
      totalSpoken: quota.amount,
      unit: quota.unit,
    },
    outline: beats,
    scriptSkeleton: scriptSkeleton(outline, quota, lang).replace('{{title}}', topic),
    layoutPick:
      'For each middle beat, quickly choose ONE layout from layoutHints (or the skill decision table) that best matches what THAT beat shows — not a round-robin. Open/close stay title.',
    contentPick:
      'Expand scriptSkeleton into full narration: hit minSentences and minWords/minChars on EVERY beat. ' +
      'Scenes must be as rich as the script (items/series ≈ sentence count). Under-writing vs targetSeconds fails.',
  };
  if (boardActive) payload.storyboard = boardText;
  const user = JSON.stringify(payload, null, 2);
  const lead = boardActive
    ? `LENGTH FIRST: targetSeconds=${target ?? 'default'}. Use the storyboard as the base; expand it + scriptSkeleton to the full speech budget (${spokenLabel}). Then pick layouts.`
    : `LENGTH FIRST: targetSeconds=${target ?? 'default'}. Expand scriptSkeleton so every ## scene hits minSentences/${unitKey}. Total spoken ≥ ${spokenLabel}. Then pick layouts.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: `${lead}\n${user}` },
  ];
}

/**
 * @param {{ title: string, lang?: string, storyboard?: string, targetSeconds?: number, complete?: Function, log?: Function }} opts
 */
export async function generateExplainer({
  title,
  lang = 'en',
  storyboard = '',
  targetSeconds = null,
  complete,
  log = () => {},
} = {}) {
  const topic = String(title || 'this topic').trim() || 'this topic';
  const subject = extractSubject(topic);
  const intent = detectIntent(topic);
  const boardActive = storyboardIsActive(storyboard);
  const fromBoard = boardActive ? outlineFromStoryboard(storyboard, { intent, subject, lang }) : null;
  const outline =
    fromBoard || planOutline({ intent, topic, subject, facts: null, lang, targetSeconds });

  if (useStubLlm() && !complete) {
    return buildFromOutline({
      topic,
      subject,
      intent,
      facts: null,
      outline,
      lang,
      targetSeconds,
    });
  }

  const settings = loadLlmSettings();
  if (!complete) {
    const ready = llmReady(settings);
    if (!ready.ok) {
      throw new ApexError(ready.detail, {
        code: 'llm_config',
        path: 'settings',
        rule: 'llm',
        hint: ready.fix || 'Open the UI Settings page (gear) to choose Local Gemma or paste a MiniMax API key.',
      });
    }
  }

  const messages = buildExplainerMessages({
    topic,
    subject,
    intent,
    outline,
    lang,
    storyboard: boardActive ? storyboard : '',
    targetSeconds,
  });
  const maxTokens = llmMaxOutputTokens(targetSeconds);
  const run = complete || ((msgs, opts) => completeChat(msgs, opts));
  const middleN = outline.filter((b) => b.role === 'middle').length;
  log(
    `autogenerate: ${complete ? 'injected' : settings.provider} · ${intent} · ${subject}` +
      (boardActive ? ' · storyboard' : '') +
      (Number.isFinite(Number(targetSeconds))
        ? ` · ${Math.round(Number(targetSeconds))}s · ${middleN} middles · maxTokens ${maxTokens}`
        : ''),
  );

  const pack = (parsed) => ({
    script: parsed.script,
    scenes: applyOutlineLayouts(parsed.scenes, outline),
    source: complete ? 'injected' : settings.provider,
    subject,
    intent,
    outline: outline.map((b) => ({ id: b.id, role: b.role, heading: b.heading, layout: b.layout })),
    notes: parsed.notes,
    storyboard: boardActive,
  });

  let text = await run(messages, { log, settings, maxTokens });
  try {
    return pack(parseLlmExplainer(text));
  } catch (first) {
    log(`autogenerate: invalid JSON, retrying (${first.message})`);
    text = await run(
      [
        ...messages,
        { role: 'assistant', content: String(text || '') },
        {
          role: 'user',
          content:
            `The previous reply was invalid (${first.message}). Reply with ONLY valid JSON: ` +
            `{ "script": "...markdown...", "scenes": { ... } }. Keep the FULL length budget — do not shorten. No markdown fences if possible.`,
        },
      ],
      { log, settings, maxTokens },
    );
    return pack(parseLlmExplainer(text));
  }
}

/**
 * Only repair missing/invalid layouts. Do not override a valid LLM choice
 * with outline rotation — the model picks by beat context.
 */
export function applyOutlineLayouts(scenes, outline) {
  if (!scenes || typeof scenes !== 'object' || !Array.isArray(outline)) return scenes;
  const allowed = new Set([
    'title',
    'cards',
    'steps',
    'compare',
    'flow',
    'stat',
    'chart',
    'timeline',
    'quote',
    'funnel',
  ]);
  const byId = new Map(outline.map((b) => [b.id, b]));
  const out = { ...scenes };
  for (const [id, scene] of Object.entries(scenes)) {
    if (!scene || typeof scene !== 'object') continue;
    const beat = byId.get(id);
    const layout = String(scene.layout || '');
    if (allowed.has(layout)) continue;
    const hints = beat?.layoutHints || layoutHintsFor(beat?.relation || 'other');
    const fallback = beat?.layout || hints[0] || 'cards';
    if (Array.isArray(scene.items) && scene.items.length) {
      const itemish = ['steps', 'flow', 'cards', 'timeline', 'funnel'];
      const itemLayout = itemish.includes(fallback)
        ? fallback
        : hints.find((h) => itemish.includes(h)) || 'cards';
      out[id] = { ...scene, layout: itemLayout, cue: scene.cue || 'sentence' };
    } else if (scene.value != null) {
      out[id] = { ...scene, layout: 'stat' };
    } else if (scene.left && scene.right) {
      out[id] = { ...scene, layout: 'compare', cue: scene.cue || 'sentence' };
    } else if (scene.text != null) {
      out[id] = { ...scene, layout: 'quote' };
    } else if (scene.title != null) {
      out[id] = { ...scene, layout: 'title' };
    } else {
      out[id] = { ...scene, layout: fallback };
    }
  }
  return out;
}

async function lookupTopic(subject, lang) {
  // Unused by Autogenerate (LLM backend). Kept for stub/fact helpers and tests.
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
 * Middle beat count scales with targetSeconds when provided.
 */
export function planOutline({ intent, topic, subject, facts, lang, targetSeconds = null }) {
  const page =
    facts?.pageTitle && pageRelevant(facts.pageTitle, subject) ? facts.pageTitle : null;
  // Open title can use the wiki page name; middle headings use a natural phrase.
  const openName = page || subject;
  const phraseName = headingPhrase(subject, page, lang);
  const baseMiddles = topicMiddles(intent, phraseName, lang);
  const t = Number(targetSeconds);
  const middles =
    Number.isFinite(t) && t >= 15
      ? scaleMiddles(baseMiddles, middleCountForTarget(t), {
          intent,
          name: phraseName,
          lang,
        })
      : baseMiddles;

  const used = new Set(['open', 'close']);
  const middleBeats = middles.map((row, i) => {
    const heading = row.heading;
    const relation = sceneRelation(intent, heading);
    return {
      id: slugSceneId(heading, used),
      role: 'middle',
      heading,
      relation,
      layoutHints: layoutHintsFor(relation),
      // Stub/mock fallback only — Autogenerate LLM picks from layoutHints by content.
      layout: layoutFor(intent, heading, i),
      factHints: row.hints || [],
    };
  });

  return [
    {
      id: 'open',
      role: 'open',
      heading: openName,
      relation: 'hook',
      layoutHints: ['title'],
      layout: 'title',
    },
    ...middleBeats,
    {
      id: 'close',
      role: 'close',
      heading: lang === 'zh-HK' ? '總結' : 'Takeaway',
      relation: 'hook',
      layoutHints: ['title', 'quote'],
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
 * Stub/mock fallback layout from scene relation.
 * Autogenerate LLM should pick from layoutHintsFor(relation) using beat content,
 * not rely on this alone.
 */
export function layoutFor(intent, heading, index = 0) {
  const relation = sceneRelation(intent, heading);
  const hints = layoutHintsFor(relation);
  if (relation === 'other' || relation === 'hook') {
    return hints[Math.abs(Number(index) || 0) % hints.length];
  }
  return hints[0];
}

/**
 * Ranked layout candidates for a visual relation (a2e-style: pick by what the beat shows).
 * First entry is the usual stub fallback.
 */
export function layoutHintsFor(relation) {
  switch (relation) {
    case 'hook':
      return ['title', 'quote'];
    case 'number':
      return ['stat', 'chart', 'quote'];
    case 'comparison':
      return ['compare', 'chart', 'cards'];
    case 'order':
      return ['steps', 'flow', 'timeline'];
    case 'cause':
      return ['flow', 'funnel', 'steps'];
    case 'filter':
      return ['funnel', 'flow', 'steps'];
    case 'parts':
      return ['cards', 'steps', 'quote'];
    case 'timeline':
      return ['timeline', 'steps', 'flow'];
    case 'trend':
      return ['chart', 'stat', 'timeline'];
    case 'quote':
      return ['quote', 'title', 'stat'];
    default:
      // Content-unknown: candidates the LLM should choose among, not a forced rotate.
      return ['steps', 'flow', 'cards', 'stat', 'chart', 'timeline', 'quote', 'compare', 'funnel'];
  }
}

/**
 * @returns {'number'|'comparison'|'order'|'parts'|'cause'|'filter'|'timeline'|'trend'|'quote'|'other'}
 */
export function sceneRelation(intent, headingLower) {
  const h = String(headingLower || '').toLowerCase();

  // One big number (explainroo `number` / a2e BigNumber).
  if (/\b(number|stat|rate|percent|figure|metric|count|總數|总数|數字|数字|數據|数据|比例|百分比|%|\d{2,})\b/i.test(h)) {
    return 'number';
  }
  // Trend / comparable magnitudes → chart.
  if (/trend|curve|chart|graph|growth|decline|mix|ratio|趨勢|趋势|曲線|曲线|圖表|图表/.test(h)) {
    return 'trend';
  }
  // Two sides (explainroo `compare` / a2e parallel lists / tradeoff).
  if (
    /compar|versus|\bvs\.?\b|differ|side by side|trade.?off|對比|对比|分別|分别|兩邊|两边|類型|类型|種類|种类|取捨|取舍/.test(
      h,
    ) ||
    intent === 'compare'
  ) {
    return 'comparison';
  }
  // Time axis / history beats (a2e timeline).
  if (
    /history|origin|timeline|evolution|era|year|century|發展|发展|歷史|历史|起源|發明|发明|年代|時間軸|时间轴/.test(h) ||
    intent === 'history'
  ) {
    return 'timeline';
  }
  // Funnel / filter / triage (a2e Trap) — before generic cause.
  if (/funnel|filter|narrow|screen out|篩選|筛选|漏斗|過濾|过滤|准入/.test(h)) {
    return 'filter';
  }
  // Ordered sequence (explainroo `steps` / a2e process).
  if (
    /step|process|method|procedure|pipeline|workflow|how it works|步驟|方法|流程|原理|運作|运作|階段|阶段/.test(h) ||
    intent === 'how'
  ) {
    return 'order';
  }
  // Cause → effect / merge (a2e flow).
  if (
    /cause|reason|effect|impact|consequence|why|because|merge|匯合|汇合|結果|结果|原因|影響|影响|後果|后果|點解|点解/.test(
      h,
    ) ||
    intent === 'why'
  ) {
    return 'cause';
  }
  // Key line / takeaway phrase.
  if (/takeaway|remember|quote|key idea|worth|記住|记住|金句|一句/.test(h)) {
    return 'quote';
  }
  // Hub: parts of a whole → cards (a2e subject + attributes).
  if (
    /taxonom|classif|anatom|trait|feature|part|component|structure|定義|定义|分類|分类|特徵|特征|結構|结构|組成|组成/.test(
      h,
    )
  ) {
    return 'parts';
  }
  return 'other';
}

function durationPhrase(targetSeconds, lang) {
  const t = Number(targetSeconds);
  if (!Number.isFinite(t) || t < 15) {
    return lang === 'zh-HK' ? '大概一分鐘' : 'about a minute';
  }
  if (t < 45) return lang === 'zh-HK' ? `大概 ${Math.round(t)} 秒` : `about ${Math.round(t)} seconds`;
  const mins = Math.round(t / 60);
  if (mins <= 1) return lang === 'zh-HK' ? '大概一分鐘' : 'about a minute';
  return lang === 'zh-HK' ? `大概 ${mins} 分鐘` : `about ${mins} minutes`;
}

function buildFromOutline({ topic, subject, intent, facts, outline, lang, targetSeconds = null }) {
  const zh = lang === 'zh-HK';
  const perMiddle = sentencesPerMiddle(targetSeconds);
  const dur = durationPhrase(targetSeconds, lang);
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
    const need = perMiddle;
    const hints = [...(beat.factHints || []), beat.heading, subject, name];
    const ranked = allFacts
      .filter((s) => !used.has(s))
      .map((s) => ({ s, score: scoreFactForBeat(s, hints) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    let bits = takeFrom(
      ranked.map((r) => r.s),
      need,
    );
    // Section bodies that match hints.
    if (bits.length < need) {
      for (const sf of sectionFacts) {
        if (bits.length >= need) break;
        const h = normalizeHeading(sf.heading);
        const ok = hints.some((hint) => {
          const k = normalizeHeading(hint);
          return k && (h.includes(k) || k.includes(h));
        });
        if (!ok) continue;
        bits = bits.concat(takeFrom(sf.sentences, need - bits.length));
      }
    }
    if (bits.length < need) bits = bits.concat(takeFrom(leadSentences, need - bits.length));
    if (bits.length < need) {
      const stubs = stubLinesForBeat({ beat, name, spoken, intent, lang, count: need });
      bits = bits.concat(stubs.slice(0, need - bits.length));
    }
    return bits.slice(0, need);
  };

  const topicTitle = zh ? zhHkCopy(topic) : topic;
  const scriptParts = [`# ${topicTitle}`, ''];
  const scenes = {};

  for (const beat of outline) {
    if (beat.role === 'open') {
      const hookFact = takeFrom(leadSentences, 1)[0];
      const line = zh
        ? `[#hook] 今日用${dur}講「${name}」。[#angle] ${
            hookFact
              ? ensureStop(hookFact, lang)
              : `我哋會用「${intentLabel(intent, 'zh')}」嘅角度，講清楚重點。`
          }`
        : `[#hook] Let's talk about ${spokenHook}. [#angle] ${
            hookFact
              ? ensureStop(hookFact, lang)
              : `In ${dur} we'll unpack ${spokenHook} clearly.`
          }`;
      scriptParts.push(`## ${beat.id}`, line, '');
      scenes[beat.id] = {
        layout: 'title',
        title: name,
        subtitle:
          shortLabel(hookFact || desc, zh ? 36 : 72, { zh, maxWords: 12 }) ||
          (zh ? `${dur}講清楚` : dur.replace(/^about /, 'About ')),
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
    const markers = ['fact', 'more', 'detail', 'extra'];
    const body = bits
      .map((bit, i) => `[#${markers[Math.min(i, markers.length - 1)]}] ${ensureStop(bit, lang)}`)
      .join(' ');
    const narr = zh
      ? `[#point] ${beat.heading}。${body}`
      : `[#point] ${beat.heading}. ${body}`;
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
function stubLinesForBeat({ beat, name, spoken, intent, lang, count = 2 }) {
  const zh = lang === 'zh-HK';
  const n = zh ? name : spoken;
  const h = String(beat.heading || '').trim();
  const need = Math.max(2, Number(count) || 2);
  let lines;
  if (zh) {
    switch (intent) {
      case 'definition':
        lines = [
          `簡單嚟講，「${n}」就係大家日常會聽到、但未必講得清嘅概念。`,
          `捉住「${h}」呢一點，成個主題就會清楚好多。`,
          `再加一個日常例子，就唔會淨係停留喺抽象定義。`,
          `最後記住邊啲特徵最值得帶出門。`,
        ];
        break;
      case 'how':
        lines = [
          `要明白「${n}」，先要睇清楚過程入面嘅關鍵一步。`,
          `跟住呢個次序，就解釋到「${n}」點樣得出結果。`,
          `中間如果跳步，成個機制就會變得好似魔術。`,
          `最後核對結果，先會知過程有冇走歪。`,
        ];
        break;
      case 'why':
        lines = [
          `點解要搞「${n}」？通常係為咗修正一個容易忽略嘅偏差。`,
          `明白呢個原因，就知「${n}」點解出現喺日曆同生活入面。`,
          `用一個具體例子對照，原因會再清楚啲。`,
          `記住呢個因果，之後見到類似現象就唔使再估。`,
        ];
        break;
      case 'history':
        lines = [
          `「${n}」唔係一開始就係而家咁，而係一步步演變出嚟。`,
          `睇清楚轉變，先會明而家點樣用「${n}」。`,
          `中間有轉折點，會解釋點解舊做法被淘汰。`,
          `而家仲有用嘅部分，通常係歷史篩過剩低嘅。`,
        ];
        break;
      case 'compare':
        lines = [
          `比較嘅時候，最緊要分清兩邊差喺邊。`,
          `分得清，先會知邊種情況更啱用「${n}」。`,
          `實際取捨往往喺成本同風險，而唔係口號。`,
          `用一張簡單清單，決策會快過憑感覺。`,
        ];
        break;
      default:
        lines = [
          `講「${n}」，先記住最核心嗰兩個重點就夠。`,
          `有咗呢啲錨點，之後再加細節都唔會亂。`,
          `用一個具體例子，抽象概念會落地。`,
          `最後揀一個最值得帶走嘅 takeaway。`,
        ];
    }
  } else {
    switch (intent) {
      case 'definition':
        lines = [
          `${capitalize(n)} is a real-world thing people name often but rarely define cleanly.`,
          `This beat focuses on ${h.toLowerCase()} so the rest of the story has a solid anchor.`,
          `A concrete example keeps the definition from floating as jargon.`,
          `Hold onto the traits that still matter once you leave the page.`,
        ];
        break;
      case 'how':
        lines = [
          `${capitalize(n)} only makes sense if you see the process in order.`,
          `Walk the steps under “${h}”, and the outcome stops feeling like magic.`,
          `Skipping a step is how the mechanism turns into a black box.`,
          `Check the result at the end so you know the path did real work.`,
        ];
        break;
      case 'why':
        lines = [
          `${capitalize(n)} exists to fix a mismatch that builds up if you ignore it.`,
          `Once you see that cause, “${h.toLowerCase()}” is the natural next beat.`,
          `A worked example makes the cause feel concrete, not abstract.`,
          `Remember the cause-and-effect pair and similar puzzles get easier.`,
        ];
        break;
      case 'history':
        lines = [
          `${capitalize(n)} did not arrive fully formed — it changed across time.`,
          `Those shifts still explain how people use ${n} today.`,
          `A turning point usually shows why older approaches fell away.`,
          `What remains useful now is often what history already stress-tested.`,
        ];
        break;
      case 'compare':
        lines = [
          `The useful move is to split ${n} into clear sides, not vague vibes.`,
          `With that contrast, you can choose which side fits the moment.`,
          `Trade-offs usually live in cost and risk, not slogans.`,
          `A short checklist beats gut feel when the decision has to stick.`,
        ];
        break;
      default:
        lines = [
          `Start with the core idea behind ${n}, then add only the details that earn their place.`,
          `If you can explain “${h.toLowerCase()}” in one breath, you understand the topic.`,
          `A concrete example pulls the idea out of abstraction.`,
          `Leave with one takeaway you could teach someone else.`,
        ];
    }
  }
  while (lines.length < need) {
    lines.push(
      zh
        ? `再補充一點關於「${h || n}」嘅細節，令成段更飽滿。`
        : `Add one more concrete detail about ${h.toLowerCase() || n} so the beat carries enough length.`,
    );
  }
  return lines.slice(0, need);
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
    case 'stat': {
      const numMatch = String(a || h || '').match(/-?\d+(?:\.\d+)?%?/);
      return {
        layout: 'stat',
        value: numMatch ? numMatch[0] : phrase(a || h || hub, zh ? 12 : 16, zh ? 12 : 8) || '—',
        unit: phrase(b || h, zh ? 16 : 24, zh ? 16 : 6) || (zh ? '重點' : 'key figure'),
        caption: c0 || h || hub,
        clipart: 'bars',
      };
    }
    case 'timeline':
      return {
        layout: 'timeline',
        cue: 'sentence',
        items: [
          { text: phrase(c0 || h, zh ? 16 : 28, zh ? 16 : 5) || (zh ? '起點' : 'Start'), marker: 'point' },
          { text: phrase(c1 || a, zh ? 16 : 28, zh ? 16 : 5) || (zh ? '轉折' : 'Turn'), marker: 'fact' },
          { text: phrase(c2 || b || hub, zh ? 16 : 28, zh ? 16 : 5) || (zh ? '而家' : 'Now'), marker: 'more' },
        ],
      };
    case 'funnel':
      return {
        layout: 'funnel',
        cue: 'sentence',
        items: [
          {
            clipart: 'funnel',
            text: phrase(c0 || h, zh ? 18 : 32, zh ? 18 : 6) || (zh ? '全部進來' : 'All in'),
            marker: 'point',
          },
          {
            text: phrase(c1 || a, zh ? 18 : 32, zh ? 18 : 6) || (zh ? '篩一輪' : 'Filter'),
            marker: 'fact',
          },
          {
            text: phrase(c2 || b || hub, zh ? 18 : 32, zh ? 18 : 6) || (zh ? '留下重點' : 'What remains'),
            marker: 'more',
          },
        ],
      };
    case 'quote':
      return {
        layout: 'quote',
        text: a || h || hub,
        attrib: b || h || (zh ? '重點' : 'Worth keeping'),
        clipart: 'book',
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
