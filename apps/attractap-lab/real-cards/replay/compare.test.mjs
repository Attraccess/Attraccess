import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createCipheriv } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  FACTORY,
  analyse,
  cardKind,
  compareOne,
  conversations,
  guessOperation,
  loadKeys,
  parseArgs,
  replayRunner,
  summaryLine,
  withoutFactoryProbe,
} from './compare.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const recordings = join(here, '../../../attractap/firmware/tests/reference-recordings/recordings');

// Made-up keys for these tests only.
const KEY = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';
const OTHER = 'c0c1c2c3c4c5c6c7c8c9cacbcccdcecf';
const factory = { label: 'factory', hex: FACTORY };
const key = { label: 'card key', hex: KEY };
const other = { label: 'other key', hex: OTHER };
const RND_A = '101112131415161718191a1b1c1d1e1f';
const RND_B = 'a0a1a2a3a4a5a6a7a8a9aaabacadaeaf';

const encrypt = (keyHex, hex) => {
  const c = createCipheriv('aes-128-cbc', Buffer.from(keyHex, 'hex'), Buffer.alloc(16));
  c.setAutoPadding(false);
  return Buffer.concat([c.update(Buffer.from(hex, 'hex')), c.final()]).toString('hex');
};
const rotate = (hex) => hex.slice(2) + hex.slice(0, 2);
const slot = (keyNo) => keyNo.toString(16).padStart(2, '0');
// AuthenticateEV2First on a slot: the card answers RndB under `cardKey`, the server sends
// RndA || RndB' under `serverKey`, and the card ends the second frame with `status`.
const auth = ({ keyNo = 1, cardKey = KEY, serverKey = cardKey, rndA = RND_A, status = '9100' } = {}) => [
  { tx: `9071000005${slot(keyNo)}0300000000`, rx: `${encrypt(cardKey, RND_B)}91af` },
  { tx: `90af000020${encrypt(serverKey, rndA + rotate(RND_B))}00`, rx: `${'ee'.repeat(32)}${status}` },
];
const getVersion = (kind = 'desfire') => ({
  tx: '9060000000',
  rx: kind === 'ntag424' ? '0404023000110591af' : '04010112001a0591af',
});
const select = { tx: '905a00000355ceac00', rx: '9100' };
const isoSelect = { tx: '00a4040007d276000085010100', rx: '9000' };
const changeKey = { tx: `90c4000029${'01'.repeat(41)}00`, rx: '5e9e7fa0054ceb6c9100' };
const keyVersion = { tx: '9064000001010', rx: '009100' };
const read = { tx: '90bd0000070000000000000000', rx: '9100' };
const conversation = (id, exchanges) => ({ id, exchanges: exchanges.map((e, i) => ({ seq: i + 1, ...e })) });

// A replay that sends the given commands and records the specs it was handed.
const fakeReplay = (tx, { ok = true, exhausted = false } = {}) => {
  const specs = [];
  const replay = (spec) => {
    specs.push(spec);
    return { tx: typeof tx === 'function' ? tx(spec) : tx, ok, exhausted, randomUsed: 0 };
  };
  return { replay, specs };
};
const serverTx = (c) => c.exchanges.map((e) => e.tx);

const tempDir = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'compare-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('reads --flag value pairs', () => {
  assert.deepEqual(parseArgs(['--wiretap', 'w.jsonl', 'stray', '--out', 'dir']), { wiretap: 'w.jsonl', out: 'dir' });
});

test('always tries the factory key first and drops duplicate keys', (t) => {
  assert.deepEqual(loadKeys(undefined), [factory]);
  assert.deepEqual(loadKeys('/nonexistent/keys.json'), [factory]);
  const file = join(tempDir(t), 'keys.json');
  writeFileSync(
    file,
    JSON.stringify([{ label: 'again factory', hex: FACTORY }, key, { label: 'dup', hex: KEY }, other]),
  );
  assert.deepEqual(loadKeys(file), [factory, key, other]);
});

test('splits the wiretap into conversations with their answers', (t) => {
  const file = join(tempDir(t), 'wiretap.jsonl');
  const message = (type, dir, payload) => JSON.stringify({ t: 1.5, type, dir, ...(payload ? { payload } : {}) });
  writeFileSync(
    file,
    [
      '{"ev":"wiretap-loaded"',
      'not json',
      '',
      message('CARD_APDU', 's2r', { conversationId: 'a', detectionId: 7, seq: 1, apdu: '9060000000' }),
      message('CARD_APDU', 's2r', { conversationId: 'b', detectionId: 8, seq: 1, apdu: '90AF000000' }),
      message('CARD_APDU_RESPONSE', 'r2s', { conversationId: 'a', seq: 1, response: '04010112001A0591AF' }),
      message('CARD_APDU', 's2r', { conversationId: 'a', detectionId: 7, seq: 2, apdu: '90af000000' }),
      message('CARD_APDU_RESPONSE', 'r2s', { conversationId: 'a', seq: 9, response: '9100' }),
      message('CARD_APDU_RESPONSE', 'r2s', { conversationId: 'unknown', seq: 1, response: '9100' }),
      message('CARD_APDU_RESPONSE', 's2r', { conversationId: 'b', seq: 1, response: '9100' }),
      message('CARD_APDU', 'r2s', { conversationId: 'c', seq: 1, apdu: '9060000000' }),
      message('CARD_APDU', 's2r'),
      message('CARD_CONVERSATION_END', 's2r', { conversationId: 'a' }),
      message('CARD_CONVERSATION_END', 's2r', { conversationId: 'unknown' }),
      message('HEARTBEAT', 's2r', {}),
    ].join('\n'),
  );
  assert.deepEqual(conversations(file), [
    {
      id: 'a',
      t: 1.5,
      detectionId: 7,
      ended: true,
      exchanges: [
        { seq: 1, tx: '9060000000', rx: '04010112001a0591af' },
        { seq: 2, tx: '90af000000', rx: null },
      ],
    },
    { id: 'b', t: 1.5, detectionId: 8, ended: false, exchanges: [{ seq: 1, tx: '90af000000', rx: null }] },
  ]);
});

test('finds the key and the server random of each authentication', () => {
  const c = conversation('x', [
    getVersion(),
    select,
    { tx: '9071000005010300000000', rx: '91ae' }, // refused at once: not an authentication
    ...auth({ keyNo: 2 }),
    ...auth({ keyNo: 3, cardKey: OTHER, rndA: 'ff'.repeat(16) }),
    ...auth({ keyNo: 4, cardKey: '11'.repeat(16) }), // no known key fits
    auth({ keyNo: 5 })[0], // the second frame never went out
  ]);
  assert.deepEqual(analyse(c, [factory, key, other]), [
    { index: 3, keyNo: 2, key, rndA: RND_A, complete: true },
    { index: 5, keyNo: 3, key: other, rndA: 'ff'.repeat(16), complete: true },
    { index: 7, keyNo: 4, key: null, rndA: null, complete: true },
    { index: 9, keyNo: 5, key: null, rndA: null, complete: false },
  ]);
});

test('reads the reference recordings with their own keys', () => {
  const rec = JSON.parse(readFileSync(join(recordings, 'ntag424-reset.json'), 'utf8'));
  const keys = [factory, { label: 'stored', hex: rec.storedKey }, { label: 'new', hex: rec.newKey }];
  const auths = analyse(rec, keys);
  assert.equal(auths.map((a) => a.rndA).join(''), rec.randomBytesConsumed);
  assert.equal(guessOperation(rec, auths), 'reset');
  assert.equal(cardKind(rec), 'ntag424');
});

test('tells tap, wrong-key tap, enroll and reset apart', () => {
  const guess = (exchanges, keys = [factory, key]) => {
    const c = conversation('x', exchanges);
    return guessOperation(c, analyse(c, keys));
  };
  assert.equal(guess([getVersion(), select, ...auth(), read]), 'tap');
  assert.equal(guess([getVersion(), select]), 'tap');
  assert.equal(guess([getVersion(), select, ...auth({ cardKey: OTHER, status: '91ae' })]), 'tap-wrong-key');
  // DESFire enroll asks for the key versions before writing a key.
  assert.equal(guess([getVersion(), select, keyVersion, ...auth({ keyNo: 0 }), changeKey]), 'enroll');
  // NTAG424 enroll: the factory key is accepted on a free slot.
  assert.equal(guess([getVersion('ntag424'), isoSelect, ...auth({ cardKey: FACTORY }), changeKey]), 'enroll');
  // Reset: the master key, then ChangeKey.
  assert.equal(guess([getVersion(), select, ...auth({ keyNo: 0 }), changeKey]), 'reset');
  // Reset whose factory probe on the slot is refused.
  assert.equal(guess([getVersion(), ...auth({ cardKey: FACTORY, status: '91ae' }), changeKey]), 'reset');
  assert.equal(guess([getVersion(), changeKey]), 'reset');
});

test('names the card kind from the GetVersion answer', () => {
  assert.equal(cardKind(conversation('x', [getVersion('ntag424')])), 'ntag424');
  assert.equal(cardKind(conversation('x', [getVersion()])), 'desfire');
  assert.equal(cardKind(conversation('x', [])), 'desfire');
  assert.equal(cardKind(conversation('x', [{ tx: '9060000000', rx: null }])), 'desfire');
});

test('cuts the refused factory probe of a reset, with the select before it', () => {
  const probe = auth({ keyNo: 1, cardKey: FACTORY, status: '91ae' });
  const master = auth({ keyNo: 0 });
  for (const sel of [select, isoSelect]) {
    const c = conversation('x', [getVersion(), sel, ...probe, sel, ...master, changeKey]);
    const cut = withoutFactoryProbe(c, analyse(c, [factory, key]));
    assert.equal(cut.probe, 3);
    assert.deepEqual(
      cut.conversation.exchanges.map((e) => e.tx),
      [getVersion(), sel, ...master, changeKey].map((e) => e.tx),
    );
    assert.equal(cut.conversation.id, 'x');
  }
  const bare = conversation('x', [getVersion(), ...probe, ...master, changeKey]);
  assert.equal(withoutFactoryProbe(bare, analyse(bare, [factory, key])).probe, 2);
});

test('leaves conversations without a refused factory probe alone', () => {
  const cases = [
    [getVersion(), select, ...auth({ keyNo: 0 }), changeKey], // master key first
    [getVersion(), select, ...auth({ keyNo: 1 }), ...auth({ keyNo: 0 })], // probe accepted
    [getVersion(), select, ...auth({ keyNo: 1, status: '91ae' }), ...auth({ keyNo: 2 })], // no master login
    [getVersion(), select, auth({ keyNo: 1 })[0]], // no second frame
    [getVersion(), select],
  ];
  for (const exchanges of cases) {
    const c = conversation('x', exchanges);
    const result = withoutFactoryProbe(c, analyse(c, [factory, key]));
    assert.equal(result.probe, 0);
    assert.equal(result.conversation, c);
  }
});

test('a tap that the 1.7.x code reproduces byte for byte matches', () => {
  const c = conversation('tap-1', [getVersion(), select, ...auth({ keyNo: 1 }), read]);
  const { replay, specs } = fakeReplay(serverTx(c));
  const result = compareOne(c, { keys: [factory, key, other], replay });
  assert.deepEqual(specs, [
    [
      'kind desfire',
      'op tap',
      'keyno 1',
      `key ${KEY}`,
      `newkey ${KEY}`,
      `rnd ${RND_A}`,
      ...c.exchanges.map((e) => `rx ${e.rx}`),
    ].join('\n'),
  ]);
  assert.deepEqual(result, {
    conversation: 'tap-1',
    operation: 'tap',
    cardKind: 'desfire',
    exchanges: 5,
    complete: true,
    keyUsed: 'card key',
    randomBytesRecovered: 16,
    referenceExchanges: 5,
    replayOutcome: 'ok',
    verdict: 'MATCH',
    recording: {
      name: 'real-desfire-tap-tap-1',
      cardKind: 'desfire',
      operation: 'tap',
      success: true,
      storedKey: KEY,
      newKey: '',
      wrongKey: '',
      randomBytesConsumed: RND_A,
      exchanges: c.exchanges.map(({ tx, rx }) => ({ tx, rx })),
    },
  });
  assert.equal(summaryLine(result), 'MATCH    desfire tap           conv tap-1 5 exchanges');
});

test('a tap with a key nobody knows is replayed as a tap with the first stored key', () => {
  const c = conversation('wrong', [
    getVersion('ntag424'),
    isoSelect,
    ...auth({ keyNo: 2, cardKey: OTHER, status: '91ae' }),
  ]);
  const { replay, specs } = fakeReplay(serverTx(c), { ok: false });
  const result = compareOne(c, { keys: [factory, key], replay });
  assert.equal(result.operation, 'tap-wrong-key');
  assert.match(specs[0], /^kind ntag424\nop tap\nkeyno 2\nkey 0f1e/);
  assert.equal(result.keyUsed, 'card key');
  assert.equal(result.replayOutcome, 'refused');
  assert.equal(result.recording.success, false);
  assert.equal(result.recording.wrongKey, KEY);
  assert.equal(result.recording.storedKey, '');
});

test('a tap without a recovered key is replayed with the factory key', () => {
  const c = conversation('nokey', [getVersion(), select]);
  const { replay, specs } = fakeReplay(serverTx(c), { ok: false, exhausted: true });
  const result = compareOne(c, { keys: [factory], replay });
  assert.match(specs[0], /keyno 1\nkey 0{32}\n/);
  assert.equal(result.keyUsed, 'none');
  assert.equal(result.replayOutcome, 'ran out of captured answers');
  assert.equal(result.recording.storedKey, '');
});

test('a reset tries every stored key and keeps the one that reproduces the server', () => {
  const c = conversation('reset-1', [
    getVersion(),
    select,
    ...auth({ keyNo: 1, cardKey: FACTORY, status: '91ae' }),
    select,
    ...auth({ keyNo: 0 }),
    changeKey,
  ]);
  const expected = [getVersion(), select, ...auth({ keyNo: 0 }), changeKey].map((e) => e.tx);
  // Only the right old key reproduces ChangeKey; the other diverges there.
  const { replay, specs } = fakeReplay((spec) =>
    spec.includes(`key ${KEY}`) ? expected : [...expected.slice(0, 4), '90c4ffff'],
  );
  const result = compareOne(c, { keys: [factory, other, key], replay });
  assert.equal(specs.length, 2);
  assert.match(specs[0], /^kind desfire\nop reset\nkeyno 0\n/);
  assert.equal(result.operation, 'reset');
  assert.equal(result.factoryProbeExchangesIgnored, 3);
  assert.equal(result.exchanges, 5);
  assert.equal(result.keyUsed, 'card key');
  assert.equal(result.verdict, 'MATCH');
  assert.equal(result.recording.storedKey, KEY);
  assert.equal(result.recording.success, true);
  assert.equal(result.recording.randomBytesConsumed, RND_A);
});

test('a reset cut before ChangeKey is recognised by its factory probe and matches up to the cut', () => {
  const c = conversation('reset-cut', [
    getVersion(),
    ...auth({ keyNo: 1, cardKey: FACTORY, status: '91ae' }),
    ...auth({ keyNo: 0 }),
  ]);
  const sent = [getVersion(), ...auth({ keyNo: 0 })].map((e) => e.tx);
  const { replay } = fakeReplay([...sent, changeKey.tx]);
  const result = compareOne(c, { keys: [factory, key], replay });
  assert.equal(result.operation, 'reset');
  assert.equal(result.factoryProbeExchangesIgnored, 2);
  assert.equal(result.verdict, 'MATCH');
  assert.equal(result.partial, true);
  assert.equal(result.note, 'identical up to the cut link');
  assert.equal(result.referenceExchanges, 4);
});

test('an enroll uses the new key; without stored keys it falls back to the factory key', () => {
  const c = conversation('enroll-1', [
    getVersion(),
    select,
    keyVersion,
    ...auth({ keyNo: 0, cardKey: FACTORY }),
    changeKey,
  ]);
  const withKey = compareOne(c, { keys: [factory, key], replay: fakeReplay(serverTx(c)).replay });
  assert.equal(withKey.operation, 'enroll');
  assert.equal(withKey.recording.newKey, KEY);
  assert.equal(withKey.recording.storedKey, '');
  const { replay, specs } = fakeReplay(serverTx(c));
  const bare = compareOne(c, { keys: [factory], replay });
  assert.equal(bare.keyUsed, 'none');
  assert.match(specs[0], /op enroll\nkeyno 0\nkey 0{32}\n/);
  assert.equal(bare.recording.newKey, FACTORY);
});

test('an ops override replaces the guess', () => {
  const c = conversation('forced', [getVersion(), select, ...auth({ keyNo: 0 }), changeKey]);
  const { replay, specs } = fakeReplay(serverTx(c));
  const result = compareOne(c, { keys: [factory, key], opOverrides: { forced: 'enroll' }, replay });
  assert.equal(result.operation, 'enroll');
  assert.match(specs[0], /op enroll/);
  assert.equal(result.recording.name, 'real-desfire-enroll-forced');
});

test('a card that went away is compared as far as it answered and marked partial', () => {
  const c = conversation('gone', [getVersion(), select, ...auth({ keyNo: 1 }), { tx: read.tx, rx: null }]);
  const { replay, specs } = fakeReplay(serverTx(c));
  const result = compareOne(c, { keys: [factory, key], replay });
  assert.match(specs[0], /\nrx none$/);
  assert.equal(result.complete, false);
  assert.equal(result.partial, true);
  assert.equal(result.verdict, 'MATCH');
  assert.equal(result.recording.success, false);
  assert.equal(result.recording.exchanges.at(-1).rx, '');
  assert.equal(summaryLine(result), 'MATCH    desfire tap           conv gone 5 exchanges (partial)');
});

test('reports the first exchange where the server and the 1.7.x code differ', () => {
  const c = conversation('bad', [getVersion(), select, ...auth({ keyNo: 1 }), read]);
  const tx = serverTx(c);
  const changed = compareOne(c, {
    keys: [factory, key],
    replay: fakeReplay([...tx.slice(0, 1), '905a000003000000', ...tx.slice(2)]).replay,
  });
  assert.equal(changed.verdict, 'MISMATCH');
  assert.deepEqual(changed.firstDifference, { exchange: 2, server: select.tx, reference: '905a000003000000' });
  assert.equal(
    summaryLine(changed),
    `MISMATCH desfire tap           conv bad 5 exchanges  first diff at exchange 2: server ${select.tx} vs 1.7.x 905a000003000000`,
  );
  const short = compareOne(c, { keys: [factory, key], replay: fakeReplay(tx.slice(0, 3)).replay });
  assert.deepEqual(short.firstDifference, { exchange: 4, server: tx[3], reference: '(1.7.x code sent nothing)' });
});

test('runs the replay binary on a spec file and reads its output', (t) => {
  const dir = tempDir(t);
  const binary = join(dir, 'replay');
  writeFileSync(
    binary,
    [
      '#!/usr/bin/env node',
      "const fs = require('node:fs');",
      "fs.copyFileSync(process.argv[2], process.argv[2] + '.seen');",
      "process.stdout.write(process.env.FAKE_REPLAY_OUTPUT.replaceAll('|', '\\n'));",
    ].join('\n'),
    { mode: 0o755 },
  );
  const run = replayRunner(binary, dir);
  process.env.FAKE_REPLAY_OUTPUT = 'kind desfire|tx 9060000000|tx 90af000000|result ok|rnd_used 32|';
  assert.deepEqual(run('kind desfire\nop tap'), {
    tx: ['9060000000', '90af000000'],
    ok: true,
    exhausted: false,
    randomUsed: 32,
  });
  assert.equal(readFileSync(join(dir, '.spec.txt.seen'), 'utf8'), 'kind desfire\nop tap');
  process.env.FAKE_REPLAY_OUTPUT = 'tx 9060000000|exhausted|';
  assert.deepEqual(run('kind desfire'), { tx: ['9060000000'], ok: false, exhausted: true, randomUsed: 0 });
  delete process.env.FAKE_REPLAY_OUTPUT;
});

test('the CLI compares a wiretap, writes recordings and fails on a complete mismatch', (t) => {
  const dir = tempDir(t);
  const c = conversation('cli-1', [getVersion(), select, ...auth({ keyNo: 1 }), read]);
  const lines = c.exchanges.flatMap((e) => [
    JSON.stringify({
      type: 'CARD_APDU',
      dir: 's2r',
      payload: { conversationId: c.id, detectionId: 1, seq: e.seq, apdu: e.tx },
    }),
    JSON.stringify({
      type: 'CARD_APDU_RESPONSE',
      dir: 'r2s',
      payload: { conversationId: c.id, seq: e.seq, response: e.rx },
    }),
  ]);
  lines.push(
    JSON.stringify({
      type: 'CARD_APDU',
      dir: 's2r',
      payload: { conversationId: 'single', seq: 1, apdu: '9060000000' },
    }),
  );
  writeFileSync(join(dir, 'wiretap.jsonl'), lines.join('\n') + '\n');
  writeFileSync(join(dir, 'keys.json'), JSON.stringify([key]));
  writeFileSync(join(dir, 'ops.json'), JSON.stringify({ 'cli-1': 'tap' }));
  const binary = join(dir, 'replay');
  writeFileSync(
    binary,
    ['#!/usr/bin/env node', "process.stdout.write(require('node:fs').readFileSync(process.env.FAKE_TX, 'utf8'));"].join(
      '\n',
    ),
    { mode: 0o755 },
  );
  const out = join(dir, 'out');
  const cli = (wiretap, tx, extra = []) => {
    writeFileSync(join(dir, 'tx.txt'), tx.map((l) => `tx ${l}\n`).join('') + 'result ok\n');
    return spawnSync(
      process.execPath,
      [
        join(here, 'compare.mjs'),
        '--wiretap',
        wiretap,
        '--keys',
        join(dir, 'keys.json'),
        '--replay',
        binary,
        '--out',
        out,
        ...extra,
      ],
      { encoding: 'utf8', env: { ...process.env, FAKE_TX: join(dir, 'tx.txt') } },
    );
  };

  const good = cli(join(dir, 'wiretap.jsonl'), serverTx(c), ['--ops', join(dir, 'ops.json')]);
  assert.equal(good.status, 0, good.stderr);
  assert.equal(
    good.stdout,
    'MATCH    desfire tap           conv cli-1 5 exchanges\n1 conversations, 1 match, 0 mismatch (complete), 0 partial\n',
  );
  const [summary] = JSON.parse(readFileSync(join(out, 'comparison.json'), 'utf8'));
  assert.equal(summary.verdict, 'MATCH');
  assert.equal(summary.recording, undefined);
  const recording = JSON.parse(readFileSync(join(out, 'real-desfire-tap-cli-1.json'), 'utf8'));
  assert.equal(recording.storedKey, KEY);
  assert.equal(recording.exchanges.length, 5);

  const bad = cli(join(dir, 'wiretap.jsonl'), serverTx(c).slice(0, 2));
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /^MISMATCH .* first diff at exchange 3/);
  assert.match(bad.stdout, /1 conversations, 0 match, 1 mismatch \(complete\), 0 partial/);

  const skipped = cli(join(dir, 'wiretap.jsonl'), [], ['--only', 'other']);
  assert.equal(skipped.status, 0);
  assert.equal(skipped.stdout, '0 conversations, 0 match, 0 mismatch (complete), 0 partial\n');

  const missing = cli(join(dir, 'missing.jsonl'), []);
  assert.equal(missing.status, 0);
  assert.equal(missing.stdout, 'no wiretap file: nothing to compare\n');
  assert.ok(existsSync(out));
});
