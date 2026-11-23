/** Compact, agent-friendly errors with optional JSON reporting. */

export class ApexError extends Error {
  constructor(message, { code = 'error', path = null, rule = null, hint = null } = {}) {
    super(message);
    this.name = 'ApexError';
    this.code = code;
    this.path = path;
    this.rule = rule;
    this.hint = hint;
  }

  toJSON() {
    return {
      ok: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.path ? { path: this.path } : {}),
        ...(this.rule ? { rule: this.rule } : {}),
        ...(this.hint ? { hint: this.hint } : {}),
      },
    };
  }
}

export function fail(message, opts) {
  throw new ApexError(message, opts);
}

/** Print a result or error; exit accordingly. */
export function report(result, { json = false, exitCode = 0 } = {}) {
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (typeof result === 'string') {
    process.stdout.write(result + (result.endsWith('\n') ? '' : '\n'));
  } else if (result?.message) {
    process.stdout.write(result.message + '\n');
  } else {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
  if (exitCode) process.exitCode = exitCode;
}

export function reportError(err, { json = false } = {}) {
  if (err instanceof ApexError) {
    if (json) {
      process.stdout.write(JSON.stringify(err.toJSON(), null, 2) + '\n');
    } else {
      const bits = [err.message];
      if (err.path) bits.push(`path: ${err.path}`);
      if (err.rule) bits.push(`rule: ${err.rule}`);
      if (err.hint) bits.push(`hint: ${err.hint}`);
      process.stderr.write(bits.join('\n') + '\n');
    }
    process.exitCode = 1;
    return;
  }
  process.stderr.write((err?.stack || String(err)) + '\n');
  process.exitCode = 1;
}
