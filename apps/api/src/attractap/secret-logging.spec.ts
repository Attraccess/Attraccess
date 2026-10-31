import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Secrets must never reach a log: reader tokens, card keys, PINs, Wi-Fi passwords, card APDUs and
 * whole messages or payloads (which carry all of these). This scans the sources of the Attractap API
 * and the reader firmware for log calls whose *runtime values* (not their fixed text) are such data.
 *
 * A value is a secret when any identifier in it contains a secret word (`keyHex`, `newKey`,
 * `pinCode`, `wifiPassword`, `apduHex`, ...), or when it is a whole message, payload or buffer
 * (`data`, `message`, `buf`, `eventData.payload`, `JSON.stringify(...)`).
 */
const REPOSITORY_ROOT = join(__dirname, '..', '..', '..', '..');

const SECRET_WORD = /key|token|secret|passw|pin|apdu|packetbuffer|credential|psk/i;

/**
 * Identifiers that contain a secret word but are not secret. Keep this short; every entry needs a reason.
 */
const SAFE_IDENTIFIERS = new Set(
  [
    // Words that merely contain a secret word.
    'ping',
    'pings',
    'pong',
    'mapping',
    'mappings',
    'stopping',
    'shipping',
    'spinner',
    'typing',
    'skipping',
    'keyboard',
    'monkey',
    'opinion',
    'pinned',
    'pinning',
    // The card's key *slot* (1-5) and key version are public card metadata, read without authentication.
    'keyNo',
    'keyNumber',
    'keyVersion',
    'keySlot',
    'availableKeyNo',
    // Ids of API tokens (database row ids), never the token itself.
    'apiTokenId',
    'tokenId',
    // Lengths and counts say nothing about the value.
    'keyLength',
    'tokenLength',
    'apduLength',
    'apduCount',
    // The API server's host:port, used as the key of the TLS certificate cache.
    'serverKey',
    'successfulServerKey',
    // GPIO pin numbers of the reader hardware (board macros PIN_* are handled below).
    'pin',
    'pins',
    'gpioPin',
    'ledPin',
    'buzzerPin',
    'resetPin',
    'irqPin',
    'csPin',
    'sckPin',
    'misoPin',
    'mosiPin',
    'sdaPin',
    'sclPin',
    'pinNumber',
    'pinMode',
  ].map((identifier) => identifier.toLowerCase()),
);

/** A whole message, payload or byte buffer, logged as-is. */
const WHOLE_MESSAGE = new Set([
  'data',
  'eventdata',
  'payload',
  'message',
  'msg',
  'body',
  'buf',
  'buffer',
  'request',
  'response',
  'frame',
  'packet',
  'doc',
  'json',
  'raw',
]);

/** `message` names error text in TypeScript templates; as a separate argument it is a whole reader message. */
const TEMPLATE_SAFE_WHOLE = new Set(['message', 'msg']);

/** GPIO numbers from the board configuration (PIN_NFC_I2C_SDA, ...). */
const GPIO_MACRO = /^PIN_[A-Z0-9_]+$/;

/**
 * Log calls that pass the scan's patterns but print no secret. Each entry: file, a snippet of the
 * call, and why it is safe.
 */
const SAFE_CALLS: Array<{ file: string; call: string; why: string }> = [
  {
    file: 'apps/api/src/attractap/security/testing/load-test.ts',
    call: '(JSON.stringify(result, null, 2))',
    why: 'the developer load test prints its own aggregate counts and timings; it handles no real reader or card',
  },
  {
    file: 'apps/attractap/firmware/src/serial/serialCommandHandler.cpp',
    call: '("RESP %s %s',
    why: 'the provisioning protocol reply channel; replies only carry status fields (pinIsSet, never the PIN or Wi-Fi password)',
  },
  {
    file: 'apps/attractap/firmware/src/api/handlers/auth.cpp',
    call: '("UNAUTHORIZED: " + message)',
    why: "the server's READER_UNAUTHORIZED reason code (PLEASE_REREGISTER), not the reader's credentials",
  },
  {
    file: 'apps/attractap/firmware/src/application/callbacks/api.cpp',
    call: '("Reader error %s: %s", title, message)',
    why: 'the error code the server sent for display on the reader screen',
  },
  {
    file: 'apps/attractap/firmware/src/display/display.cpp',
    call: '(buf)',
    why: "LVGL's own log lines (UI library diagnostics), not reader data",
  },
  {
    file: 'apps/attractap/firmware/src/rfid/pn532/driver.cpp',
    call: 'data[szPos]',
    why: 'body of the PrintHex/PrintHexChar helpers; their callers are scanned',
  },
];

/** Members that turn a value into its text without changing what it is (`message.c_str()`). */
const TEXT_ACCESSORS = new Set(['c_str', 'str', 'toString', 'toJSON', 'valueOf']);

function sourceFiles(directory: string, extensions: string[]): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path, extensions);
    return extensions.some((extension) => name.endsWith(extension)) ? [path] : [];
  });
}

/**
 * Identifier chains (`this.socket.token`, `(error as Error).message`) of an expression. A chain that
 * continues another expression (`).message`) starts with the placeholder segment `(expr)`.
 */
function chainsOf(expression: string): string[][] {
  // A literal index into the PN532 frame reads one status or flag byte, never card data.
  const source = expression
    .replace(/\bpn532_packetbuffer\s*\[\s*\d+\s*\]/g, 'pn532Status')
    // `Object.keys(x)` lists property names.
    .replace(/\bObject\s*\.\s*keys\b/g, 'Object.names');
  const chains: string[][] = [];
  const pattern = /((?:\?\.|\.|->|::)\s*)?([A-Za-z_]\w*(?:\s*(?:\?\.|\.|->|::)\s*[A-Za-z_]\w*)*)/g;
  for (const match of source.matchAll(pattern)) {
    const segments = match[2].split(/\s*(?:\?\.|\.|->|::)\s*/);
    if (match[1]) segments.unshift('(expr)');
    if (segments[0] === 'this' || segments[0] === 'self') segments.shift();
    while (segments.length > 1 && TEXT_ACCESSORS.has(segments[segments.length - 1])) segments.pop();
    chains.push(segments);
  }
  return chains;
}

function leakIn(expression: string, inTemplate: boolean): string | null {
  if (/\bJSON\s*\.\s*stringify\b|\bserializeJson\b|\bmeasureJson\b/.test(expression))
    return 'serializes a whole object';
  for (const segments of chainsOf(expression)) {
    const secret = segments.find(
      (segment) =>
        SECRET_WORD.test(segment) && !SAFE_IDENTIFIERS.has(segment.toLowerCase()) && !GPIO_MACRO.test(segment),
    );
    if (secret) return `logs ${secret}`;
    const last = segments[segments.length - 1].toLowerCase();
    // `data`, `buf`, `eventData.payload`: the whole thing. `error.message` and `data.type` are fine.
    const whole = segments.length === 1 ? WHOLE_MESSAGE.has(last) : last === 'payload' || last === 'data';
    if (whole && !(inTemplate && TEMPLATE_SAFE_WHOLE.has(last))) return `logs the whole ${segments.join('.')}`;
  }
  return null;
}

/**
 * Why a log call leaks a secret, or null when it does not. Looks at what the call evaluates at
 * runtime: its arguments without the fixed text of string literals, plus the `${...}` expressions of
 * template literals.
 */
function leak(call: string): string | null {
  // A declaration (`PrintHex(const byte *data, ...)`) is not a call.
  if (/^\(\s*const\b/.test(call)) return null;
  // `payload["error"]` is a member access, not text.
  const members = call.replace(/\[\s*["'`]([A-Za-z_]\w*)["'`]\s*\]/g, '.$1');
  const templates = [...members.matchAll(/\$\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((match) => match[1]);
  const outsideText = members.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, ' ');
  return leakIn(outsideText, false) ?? templates.map((expression) => leakIn(expression, true)).find(Boolean) ?? null;
}

function logCalls(source: string, pattern: RegExp): Array<{ call: string; index: number }> {
  const calls: Array<{ call: string; index: number }> = [];
  for (const match of source.matchAll(pattern)) {
    let depth = 0;
    let index = (match.index ?? 0) + match[0].length - 1;
    const start = index;
    for (; index < source.length; index++) {
      if (source[index] === '(') depth++;
      if (source[index] === ')' && --depth === 0) break;
    }
    calls.push({ call: source.slice(start, index + 1), index: start });
  }
  return calls;
}

const API_LOG_CALL = /\b(?:logger|Logger|console)\s*\.\s*(?:log|debug|warn|error|verbose|info|fatal|trace)\s*\(/g;
const FIRMWARE_LOG_CALL = new RegExp(
  [
    // Logger (logger.info, this->logger.errorf, Logger::log, mainLogger.debug, ...)
    String.raw`\b\w*(?:logger|Logger)\s*(?:\.|->|::)\s*(?:debug|info|warn|error|trace|log)f?\s*\(`,
    // Raw console output.
    String.raw`(?<![\w.>:])(?:::)?(?:printf|ets_printf|vprintf|puts)\s*\(`,
    String.raw`\bfprintf\s*\((?=\s*(?:stderr|stdout))`,
    String.raw`\bESP_(?:EARLY_)?LOG[EWIDV]\s*\(`,
    String.raw`\b(?:Serial|PN532DEBUGPRINT)\s*\.\s*(?:print|println|printf|write)\s*\(`,
    String.raw`\bPrintHex(?:Char)?\s*\(`,
  ].join('|'),
  'g',
);

/** The logger itself prints the already formatted line it is given. */
const FIRMWARE_LOG_IMPLEMENTATIONS = [
  'apps/attractap/firmware/src/logger/',
  'apps/attractap/firmware/src/rfid/pn532_platform.hpp',
];

function scan(root: string, extensions: string[], pattern: RegExp, skip: (path: string) => boolean): string[] {
  const offenders: string[] = [];
  for (const path of sourceFiles(join(REPOSITORY_ROOT, root), extensions)) {
    const file = relative(REPOSITORY_ROOT, path);
    if (skip(file)) continue;
    const source = readFileSync(path, 'utf8');
    for (const { call, index } of logCalls(source, pattern)) {
      const reason = leak(call);
      if (reason && !SAFE_CALLS.some((safe) => safe.file === file && call.includes(safe.call))) {
        const line = source.slice(0, index).split('\n').length;
        offenders.push(`${file}:${line} (${reason}): ${call.replace(/\s+/g, ' ').slice(0, 140)}`);
      }
    }
  }
  return offenders;
}

describe('secrets in logs', () => {
  it('the API never logs payloads, keys, tokens or card traffic', () => {
    const offenders = scan('apps/api/src/attractap', ['.ts'], API_LOG_CALL, (file) =>
      /\.(spec|test-fixture)\.ts$/.test(file),
    );
    expect(offenders).toEqual([]);
  });

  it('the reader firmware never logs keys, tokens, PINs, passwords or card traffic', () => {
    const offenders = scan('apps/attractap/firmware/src', ['.cpp', '.hpp', '.h', '.c'], FIRMWARE_LOG_CALL, (file) =>
      FIRMWARE_LOG_IMPLEMENTATIONS.some((prefix) => file.startsWith(prefix)),
    );
    expect(offenders).toEqual([]);
  });

  describe('the scan notices', () => {
    const firstCall = (source: string, pattern: RegExp) => logCalls(source, new RegExp(pattern.source, 'g'))[0].call;

    it.each([
      'this.logger.debug(`token ${socket.token}`);',
      "this.logger.debug('processing READER_AUTHENTICATE event', data);",
      'this.logger.debug(`Received: ${JSON.stringify(message)}`);',
      "this.logger.debug(`new key ${newKey.toString('hex')}`);",
      'this.logger.log(`key ${keyHex}`);',
      'this.logger.debug(`pin ${pinCode}`);',
      "this.logger.warn('wifi', wifiPassword);",
      'this.logger.debug(`payload ${eventData.payload}`);',
      'console.log(apdu);',
      'this.logger.debug(`answer ${payload["key"]}`);',
      "this.logger.debug('sending', message);",
    ])('API: %s', (source) => {
      expect(leak(firstCall(source, API_LOG_CALL))).not.toBeNull();
    });

    it.each([
      'this->logger.debug(("sendMessage: " + message).c_str());',
      'logger.error((std::string("Failed to parse payload: ") + std::string(buf, len)).c_str());',
      'logger.infof("Wi-Fi password: %s", wifiPassword.c_str());',
      'this->logger.debugf("PIN %s", pinCode);',
      'printf("key %s\\n", keyHex);',
      'ESP_LOGI(TAG, "token %s", readerToken);',
      'PN532DEBUGPRINT.println(sessionKey[0]);',
      'Adafruit_PN532::PrintHex(_key, 6);',
      'PrintHexChar(pn532_packetbuffer, 26);',
      'Serial.println(apduHex);',
    ])('firmware: %s', (source) => {
      expect(leak(firstCall(source, FIRMWARE_LOG_CALL))).not.toBeNull();
    });

    it.each([
      ['this.logger.debug(`Received event from client ${socket.id}: ${eventData.type}`);', API_LOG_CALL],
      ['this.logger.error(`Failed to send raw message to client ${id}: ${(error as Error).message}`);', API_LOG_CALL],
      ['this.logger.warn(`Coredump symbolication failed: ${message}`);', API_LOG_CALL],
      ['this.logger.debug(`card key slot ${keyNo}, version ${keyVersion}`);', API_LOG_CALL],
      ['logger.infof("I2C init: SDA=%d", PIN_NFC_I2C_SDA);', FIRMWARE_LOG_CALL],
      ['this->logger.error(("card error: " + payload["error"].as<std::string>()).c_str());', FIRMWARE_LOG_CALL],
      ['printf("PN532 InDataExchange status 0x%02X\\n", pn532_packetbuffer[7]);', FIRMWARE_LOG_CALL],
    ])('but not: %s', (source, pattern) => {
      expect(leak(firstCall(source, pattern))).toBeNull();
    });
  });
});
