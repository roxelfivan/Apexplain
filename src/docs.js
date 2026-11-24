import fs from 'node:fs';
import path from 'node:path';
import { ApexError } from './errors.js';
import { DOCS_DIR, ROOT } from './paths.js';

const TOPICS = {
  plan: {
    file: 'apexplain-token-mvp.md',
    summary: 'Phased MVP plan: product target, architecture, Phase 1–6',
  },
  settings: {
    file: 'settings.md',
    summary: 'Settings: Autogenerate LLM (Gemma/MiniMax) and on-demand TTS (Kokoro/Vocello)',
  },
  overview: {
    file: null,
    summary: 'What Apexplain is and how agents should use it',
    inline: `# Apexplain overview

Apexplain turns \`script.md\` + \`scenes.json\` into a narrated MP4.

1. Read \`skills/apexplain/SKILL.md\` (or \`apexplain docs overview\`).
2. \`apexplain init videos/<name> --title "..." --lang en|zh-HK\`
3. Edit \`script.md\` (45–90s) and \`scenes.json\` (5 layouts).
4. \`apexplain make videos/<name> --dry-run\` then \`apexplain make videos/<name>\`.
5. Or open the UI: \`apexplain ui --port 3847\`. Settings (gear) chooses **Local Gemma** or a **MiniMax API key** for Autogenerate.

\`lang=en\` → local Kokoro. \`lang=zh-HK\` → local Vocello CLI (Voice Design + Cantonese brief; \`npm run setup:vocello\` or UI Settings).
TTS/LLM weights are **not in git** — download on demand. Make/TTS are local-first (HF only with \`APEXPLAIN_ALLOW_HF=1\`). Autogenerate uses the Settings LLM (local Gemma or MiniMax).

Layouts: \`title\`, \`cards\`, \`steps\`, \`compare\`, \`flow\`. Output: \`out/video.mp4\`.
`,
  },
};

export function listTopics() {
  return Object.entries(TOPICS).map(([id, t]) => ({ id, summary: t.summary }));
}

export function getDoc(id) {
  if (!id) {
    const lines = [
      'Apexplain docs. Usage: apexplain docs <id>',
      '',
      ...listTopics().map((t) => `  ${t.id.padEnd(12)} ${t.summary}`),
      '',
      'Also see README.md and docs/apexplain-token-mvp.md in the repo.',
    ];
    return { ok: true, topics: listTopics(), message: lines.join('\n') };
  }

  const topic = TOPICS[id];
  if (!topic) {
    throw new ApexError(`unknown docs topic "${id}"`, {
      code: 'unknown_docs',
      path: `docs/${id}`,
      rule: 'known_topic',
      hint: `Known topics: ${Object.keys(TOPICS).join(', ')}`,
    });
  }

  let body;
  if (topic.inline) {
    body = topic.inline;
  } else {
    const file = path.join(DOCS_DIR, topic.file);
    if (!fs.existsSync(file)) {
      throw new ApexError(`docs file missing: ${topic.file}`, {
        code: 'missing_docs',
        path: path.relative(ROOT, file),
      });
    }
    body = fs.readFileSync(file, 'utf8');
  }

  return { ok: true, id, message: body };
}
