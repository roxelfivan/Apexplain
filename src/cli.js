import { report, reportError, ApexError } from './errors.js';
import { doctor } from './doctor.js';
import { getDoc } from './docs.js';
import { initProject } from './init.js';
import { make } from './make.js';
import { packageVersion } from './paths.js';
import { previewProject } from './preview.js';

const HELP = `apexplain ${packageVersion()} — agent-run explainer videos

Usage:
  apexplain init <dir> [--title TEXT] [--size 16:9|9:16] [--theme studio|dark]
  apexplain make <dir> [--draft] [--force] [--json]
  apexplain make <dir> --dry-run [--json]
  apexplain make <dir> --estimate [--json]
  apexplain make <dir> --voice-only [--force] [--json]
  apexplain preview <dir> [--json]
  apexplain doctor [--json]
  apexplain docs [id] [--json]
  apexplain help
  apexplain version

Full make: validate → Kokoro voice (cached) → layout-check → render → MP4.
APEXPLAIN_TTS=mock skips the model download (tests).
See: apexplain docs plan
`;

function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') flags.json = true;
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--estimate') flags.estimate = true;
    else if (a === '--voice-only') flags.voiceOnly = true;
    else if (a === '--force') flags.force = true;
    else if (a === '--draft') flags.draft = true;
    else if (a === '--title') flags.title = argv[++i];
    else if (a === '--size') flags.size = argv[++i];
    else if (a === '--theme') flags.theme = argv[++i];
    else if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--version' || a === '-V') flags.version = true;
    else if (a.startsWith('-')) {
      throw new ApexError(`unknown flag ${a}`, {
        code: 'bad_flag',
        path: a,
        rule: 'known_flag',
        hint: 'Run apexplain help',
      });
    } else positionals.push(a);
  }
  return { flags, positionals };
}

export async function run(argv) {
  let flags;
  let positionals;
  try {
    ({ flags, positionals } = parseArgs(argv));
  } catch (err) {
    reportError(err, { json: argv.includes('--json') });
    return;
  }

  const json = !!flags.json;
  const cmd = positionals[0];

  if (flags.help || !cmd || cmd === 'help') {
    report(HELP.trimEnd(), { json: false });
    if (json) report({ ok: true, help: true, version: packageVersion() }, { json: true });
    return;
  }
  if (flags.version || cmd === 'version') {
    report(json ? { ok: true, version: packageVersion() } : packageVersion(), { json });
    return;
  }

  try {
    if (cmd === 'init') {
      const dir = positionals[1];
      if (!dir) throw new ApexError('usage: apexplain init <dir>', { code: 'usage', rule: 'args' });
      const result = initProject(dir, {
        title: flags.title,
        size: flags.size,
        theme: flags.theme,
      });
      report(json ? result : result.message, { json });
      return;
    }

    if (cmd === 'make') {
      const dir = positionals[1];
      if (!dir) {
        throw new ApexError('usage: apexplain make <dir> [--dry-run|--estimate|--voice-only]', {
          code: 'usage',
          rule: 'args',
        });
      }
      const result = await make(dir, {
        dryRun: !!flags.dryRun,
        estimate: !!flags.estimate,
        voiceOnly: !!flags.voiceOnly,
        force: !!flags.force,
        draft: !!flags.draft,
      });
      report(json ? result : result.message, { json });
      return;
    }

    if (cmd === 'doctor') {
      const result = doctor();
      report(json ? result : result.message, { json, exitCode: result.ok ? 0 : 1 });
      return;
    }

    if (cmd === 'docs') {
      const result = getDoc(positionals[1]);
      report(json ? result : result.message, { json });
      return;
    }

    if (cmd === 'preview') {
      const dir = positionals[1];
      if (!dir) throw new ApexError('usage: apexplain preview <dir>', { code: 'usage', rule: 'args' });
      const result = previewProject(dir);
      report(json ? result : result.message, { json });
      return;
    }

    throw new ApexError(`unknown command "${cmd}"`, {
      code: 'unknown_command',
      rule: 'known_command',
      hint: 'Run apexplain help',
    });
  } catch (err) {
    reportError(err, { json });
  }
}
