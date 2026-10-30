import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Pairing, session and reader-websocket code must never put keys, nonces, tokens, tickets,
 * codes or decrypted payloads into logs. This scans every logger/console call in those
 * modules, including calls that span several lines and values passed as extra arguments.
 */
const SECRET =
  /token|nonce|ticket|secret|password|privatekey|private_key|\bkey\b|keystring|\bcode\b|payload|plaintext|decrypted|pem\b/i;
/** Extra arguments that are whole message objects carry payloads. */
const WHOLE_MESSAGE = /^(data|message|event|eventdata|payload|body|frame|request|req)(\.data)?(\.payload)?$/i;

const ROOT = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'testing' ? [] : sources(path);
    return /\.ts$/.test(name) && !/\.(spec|test-fixture)\.ts$/.test(name) ? [path] : [];
  });
}

/** Every `logger.x(...)` / `console.x(...)` call with its full, parenthesis-balanced argument text. */
export function logCalls(source: string): string[] {
  const calls: string[] = [];
  const start = /\b(?:this\.)?(?:logger|console)\.(?:log|debug|verbose|warn|error|info|fatal)\(/g;
  let match: RegExpExecArray | null;
  while ((match = start.exec(source))) {
    let depth = 1;
    let i = match.index + match[0].length;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') depth--;
    }
    calls.push(source.slice(match.index + match[0].length, i - 1));
  }
  return calls;
}

/** Splits top-level arguments (good enough for log calls: no nested commas outside brackets). */
function topLevelArguments(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const char of args) {
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '`' || char === "'" || char === '"') quote = char;
    else if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth--;
    else if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function leaks(call: string): string[] {
  const problems: string[] = [];
  for (const interpolation of call.match(/\$\{[^}]*\}/g) ?? []) {
    if (SECRET.test(interpolation)) problems.push(interpolation);
  }
  const [, ...extra] = topLevelArguments(call);
  for (const argument of extra) {
    if (SECRET.test(argument) || WHOLE_MESSAGE.test(argument)) problems.push(argument);
  }
  return problems;
}

describe('secret hygiene in logs', () => {
  const files = [
    ...sources(join(ROOT, 'security')),
    ...sources(join(ROOT, 'websockets')),
    join(ROOT, 'pairing.controller.ts'),
  ];

  it.each(files.map((f) => [relative(ROOT, f), f]))('%s logs no secret material', (_name, file) => {
    const offending = logCalls(readFileSync(file, 'utf8')).filter((call) => leaks(call).length > 0);
    expect(offending).toEqual([]);
  });

  it('catches the leaks this scan exists for', () => {
    // The two lines that used to print the registration token and the authentication payload.
    const examples = [
      'this.logger.debug(\n  `Sending REGISTER response to client. Reader ID: ${response.reader.id}, Token: ${response.token}`,\n);',
      "this.logger.debug('processing READER_AUTHENTICATE event', data);",
      'this.logger.debug(`Sending ${message.event}`, message.data.payload);',
      'this.logger.log(`nonce=${request.serverNonce.toString("hex")}`);',
    ];
    for (const example of examples) expect(logCalls(example).flatMap(leaks)).not.toEqual([]);
    expect(logCalls('this.logger.debug(`Reader ${reader.id} connected`);').flatMap(leaks)).toEqual([]);
  });
});
