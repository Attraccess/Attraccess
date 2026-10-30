import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Secrets must never reach a log: reader tokens, card keys, card APDUs and whole message payloads.
 * This scans the sources of the Attractap API and the reader firmware for log calls whose
 * *arguments* (not their fixed text) mention such values.
 */
const REPOSITORY_ROOT = join(__dirname, '..', '..', '..', '..');
const FORBIDDEN = /\b(payload|eventData|key|keys|token|secret|password|apdu|apdus)\b/i;

function sourceFiles(directory: string, extensions: string[]): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path, extensions);
    return extensions.some((extension) => name.endsWith(extension)) ? [path] : [];
  });
}

/**
 * What a log call evaluates at runtime: its argument expressions without the fixed text of string
 * literals, plus the `${...}` expressions of template literals. Values that only name the kind of
 * event or error (`eventData.type`, `payload["error"]`) are not data.
 */
function runtimeExpressions(call: string): string {
  const named = call.replace(/\beventData\.type\b|\bpayload\["error"\]/g, 'name');
  const expressions = [...named.matchAll(/\$\{([^}]*)\}/g)].map((match) => match[1]).join(' ');
  const outsideText = named.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '');
  return `${outsideText} ${expressions}`;
}

function logCalls(source: string, pattern: RegExp): string[] {
  const calls: string[] = [];
  for (const match of source.matchAll(pattern)) {
    let depth = 0;
    let index = match.index! + match[0].length - 1;
    const start = index;
    for (; index < source.length; index++) {
      if (source[index] === '(') depth++;
      if (source[index] === ')' && --depth === 0) break;
    }
    calls.push(source.slice(start, index + 1));
  }
  return calls;
}

describe('secrets in logs', () => {
  it('the API never logs payloads, keys, tokens or card traffic', () => {
    const offenders: string[] = [];
    const root = join(REPOSITORY_ROOT, 'apps/api/src/attractap');
    for (const path of sourceFiles(root, ['.ts']).filter((p) => !/\.(spec|test-fixture)\.ts$/.test(p))) {
      const source = readFileSync(path, 'utf8');
      for (const call of logCalls(source, /\b(?:logger|console)\.(?:log|debug|warn|error|verbose|info)\s*\(/g)) {
        if (FORBIDDEN.test(runtimeExpressions(call)))
          offenders.push(`${relative(REPOSITORY_ROOT, path)}: ${call.slice(0, 120)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the reader firmware never logs keys, tokens or card traffic', () => {
    const offenders: string[] = [];
    const root = join(REPOSITORY_ROOT, 'apps/attractap/firmware/src');
    const forbidden = /\b(key|keys|token|secret|password|apdu|payload)\b|\bpn532_packetbuffer\b/i;
    for (const path of sourceFiles(root, ['.cpp', '.hpp', '.h'])) {
      const source = readFileSync(path, 'utf8');
      for (const call of logCalls(
        source,
        /\b(?:logger|Logger|log)\s*(?:\.|->)\s*(?:debug|info|warn|error|trace)f?\s*\(/g,
      )) {
        if (forbidden.test(runtimeExpressions(call)))
          offenders.push(`${relative(REPOSITORY_ROOT, path)}: ${call.slice(0, 120)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the scan notices a log call that mentions a secret', () => {
    const call = logCalls('logger.debug(`token ${socket.token}`);', /\blogger\.debug\s*\(/g)[0];
    expect(FORBIDDEN.test(runtimeExpressions(call))).toBe(true);
  });
});
