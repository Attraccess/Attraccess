#!/usr/bin/env node
/* eslint-disable no-console -- the CLI reports its verdicts on stdout. */
// Checks the server's card conversations (from the API wiretap) against the 1.7.x firmware card
// code replayed on the same card answers (replay.cpp). For every complete conversation:
//   1. the key of each AuthenticateEV2First is found by trying the known keys against the card's
//      answer (RndB) and the server's part 2 (RndA || RndB'): only the right key is consistent;
//   2. RndA, the server's random value, is read from that payload;
//   3. replay.cpp runs the OLD firmware code with the captured card answers and these randoms;
//   4. the APDUs it sends must equal the APDUs the server sent, byte for byte.
// It also writes each conversation in the reference-recordings JSON format, so the API's
// reference-recordings.spec.ts can replay it.
//
//   node compare.mjs --wiretap wiretap.jsonl --keys keys.json --out DIR [--replay build/replay]
//                    [--ops ops.json] [--card-kind-from-uid ...]
// keys.json: [{"label":"alice slot1","hex":"..."} ...]; the factory key is always tried.
// ops.json (optional): {"<conversationId>": "enroll|tap|reset|tap-wrong-key"} overrides the guess.
import { createDecipheriv } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FACTORY = '00'.repeat(16);

export function parseArgs(argv) {
  return Object.fromEntries(
    argv.reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
  );
}

// The factory key first, then the keys file (without duplicates).
export function loadKeys(path) {
  const keys = [{ label: 'factory', hex: FACTORY }];
  if (!path || !existsSync(path)) return keys;
  for (const k of JSON.parse(readFileSync(path, 'utf8'))) if (!keys.some((x) => x.hex === k.hex)) keys.push(k);
  return keys;
}

const aesCbcDecrypt = (key, data) => {
  const d = createDecipheriv('aes-128-cbc', Buffer.from(key, 'hex'), Buffer.alloc(16));
  d.setAutoPadding(false);
  return Buffer.concat([d.update(data), d.final()]);
};

// ---- conversations from the wiretap ---------------------------------------------------------
function addMessage(byId, m) {
  const p = m.payload;
  if (!p) return;
  if (m.type === 'CARD_APDU' && m.dir === 's2r') {
    if (!byId.has(p.conversationId))
      byId.set(p.conversationId, {
        id: p.conversationId,
        t: m.t,
        detectionId: p.detectionId,
        exchanges: [],
        ended: false,
      });
    byId.get(p.conversationId).exchanges.push({ seq: p.seq, tx: String(p.apdu).toLowerCase(), rx: null });
  } else if (m.type === 'CARD_APDU_RESPONSE' && m.dir === 'r2s') {
    const e = byId.get(p.conversationId)?.exchanges.find((x) => x.seq === p.seq);
    if (e) e.rx = String(p.response).toLowerCase();
  } else if (m.type === 'CARD_CONVERSATION_END' && m.dir === 's2r') {
    const c = byId.get(p.conversationId);
    if (c) c.ended = true;
  }
}

export function conversations(path) {
  const byId = new Map();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.startsWith('{')) continue;
    let m;
    try {
      m = JSON.parse(line);
    } catch {
      continue;
    }
    addMessage(byId, m);
  }
  return [...byId.values()];
}

// ---- reading the conversation ---------------------------------------------------------------
const ev2First = (tx) => tx.startsWith('9071000005');
const stripStatus = (rx) => rx.slice(0, -4);
const isChangeKey = (e) => e.tx.startsWith('90c4');

// The key (and the server's RndA) of one complete AuthenticateEV2First: the only known key under
// which the server's part 2 holds the card's RndB rotated by one byte.
function recoverKey(entry, rx, next, keys) {
  const part1 = Buffer.from(stripStatus(rx), 'hex');
  const part2 = Buffer.from(next.tx.slice(10, 10 + 64), 'hex');
  for (const k of keys) {
    const rndB = aesCbcDecrypt(k.hex, part1);
    const plain = aesCbcDecrypt(k.hex, part2);
    const rotated = Buffer.concat([rndB.subarray(1), rndB.subarray(0, 1)]);
    if (plain.subarray(16).equals(rotated)) {
      entry.key = k;
      entry.rndA = plain.subarray(0, 16).toString('hex');
      return;
    }
  }
}

export function analyse(conversation, keys) {
  const ex = conversation.exchanges;
  const auths = []; // {index, keyNo, key, rndA}
  for (let i = 0; i < ex.length; i++) {
    if (!ev2First(ex[i].tx) || !ex[i].rx?.endsWith('91af')) continue;
    const next = ex[i + 1];
    const keyNo = parseInt(ex[i].tx.slice(10, 12), 16);
    const entry = { index: i, keyNo, key: null, rndA: null, complete: !!next && next.tx.startsWith('90af000020') };
    if (entry.complete) recoverKey(entry, ex[i].rx, next, keys);
    auths.push(entry);
  }
  return auths;
}

export function guessOperation(conversation, auths) {
  const ex = conversation.exchanges;
  if (!ex.some(isChangeKey)) {
    const last = auths.at(-1);
    return last && !last.key ? 'tap-wrong-key' : 'tap';
  }
  // Enroll looks for a free slot first (DESFire: GetKeyVersion, NTAG424: authenticates slots 1..5 with
  // the factory key); reset authenticates the master key and goes straight to ChangeKey.
  if (ex.some((e) => e.tx.startsWith('9064'))) return 'enroll';
  // Enroll looks for a free slot: the factory key is accepted there (9100 after the second auth frame).
  // Reset first tries the factory key on the card's slot to see whether it is already factory; the card
  // refuses it (91ae) and the master key login follows.
  const first = auths[0];
  const firstAccepted = first ? ex[first.index + 1]?.rx?.endsWith('9100') === true : false;
  if (first && first.keyNo !== 0 && firstAccepted) return 'enroll';
  return 'reset';
}

export function cardKind(conversation) {
  const rx = conversation.exchanges[0]?.rx ?? '';
  return rx.slice(2, 4) === '04' ? 'ntag424' : 'desfire';
}

// Runs replay.cpp on one spec (written to outDir/.spec.txt) and reads what the 1.7.x code sent.
export function replayRunner(replayBinary, outDir) {
  return (spec) => {
    const specPath = join(outDir, '.spec.txt');
    writeFileSync(specPath, spec);
    const out = execFileSync(replayBinary, [specPath], { encoding: 'utf8' });
    const lines = out.split('\n');
    return {
      tx: lines.filter((l) => l.startsWith('tx ')).map((l) => l.slice(3)),
      ok: lines.includes('result ok'),
      exhausted: lines.includes('exhausted'),
      randomUsed: Number((lines.find((l) => l.startsWith('rnd_used ')) ?? 'rnd_used 0').slice(9)),
    };
  };
}

// The server's reset first tries the factory key on the card's slot (select, AuthenticateEV2First and its
// second frame) so a reset that already got through is recognised on the next tap. The 1.7.x firmware has
// no such step; it is the one intended difference, so it is cut out before the byte comparison.
export function withoutFactoryProbe(conversation, auths) {
  const first = auths[0];
  const ex = conversation.exchanges;
  const refused = first && first.keyNo !== 0 && ex[first.index + 1]?.rx?.endsWith('91ae') === true;
  const masterFollows = auths[1]?.keyNo === 0;
  if (!refused || !masterFollows) return { conversation, probe: 0 };
  const selectsApp = (tx) => tx?.startsWith('00a4') || tx?.startsWith('905a');
  const from = selectsApp(ex[first.index - 1]?.tx) ? first.index - 1 : first.index;
  const exchanges = [...ex.slice(0, from), ...ex.slice(first.index + 2)];
  return { conversation: { ...conversation, exchanges }, probe: first.index + 2 - from };
}

// ---- comparing one conversation -------------------------------------------------------------
const isTap = (operation) => operation === 'tap' || operation === 'tap-wrong-key';

// The key slot the replay works on: a tap uses the slot it authenticated; a ChangeKey conversation the
// slot of its last auth; anything else slot 1.
function replayKeyNo(operation, ex, auths) {
  if (isTap(operation)) return auths.at(-1)?.keyNo ?? 1;
  return ex.find(isChangeKey)?.tx ? Number.parseInt(auths.at(-1)?.keyNo ?? 1, 10) : 1;
}

// Key candidates for the replay: tap = the key that authenticated; reset = the old key (tried from the
// list, the one that reproduces the server's ChangeKey wins); enroll = the new key (the key of the last auth).
function replayCandidates(operation, auths, keys) {
  const none = [{ label: 'none', hex: FACTORY }];
  const nonFactory = keys.filter((k) => k.hex !== FACTORY);
  let candidates;
  if (operation === 'tap') candidates = [auths.at(-1)?.key].filter(Boolean);
  else if (operation === 'tap-wrong-key') candidates = nonFactory.slice(0, 1);
  else candidates = nonFactory.length ? nonFactory : none;
  return candidates.length ? candidates : none;
}

function replaySpec({ kind, operation, keyNo, candidate, randoms, ex }) {
  return [
    `kind ${kind}`,
    `op ${operation === 'tap-wrong-key' ? 'tap' : operation}`,
    `keyno ${keyNo}`,
    `key ${candidate.hex}`,
    `newkey ${candidate.hex}`,
    `rnd ${randoms.join('')}`,
    ...ex.map((e) => `rx ${e.rx ?? 'none'}`),
  ].join('\n');
}

// Index of the first exchange where the replayed and the server's commands differ, -1 when identical.
function firstDifference(replayedTx, ex) {
  const n = Math.max(replayedTx.length, ex.length);
  for (let i = 0; i < n; i++) if (replayedTx[i] !== ex[i]?.tx) return i;
  return -1;
}

// The attempt that agrees with the server the longest (a full match first).
function bestAttempt(attempts) {
  const reach = (a) => (a.firstDiff === -1 ? Infinity : a.firstDiff);
  return attempts.sort((a, b) => (reach(a) < reach(b) ? 1 : -1))[0];
}

function replayOutcome(replayed) {
  if (replayed.ok) return 'ok';
  return replayed.exhausted ? 'ran out of captured answers' : 'refused';
}

function verdict(best, ex) {
  if (best.firstDiff === -1) return { verdict: 'MATCH' };
  // The server sent every command identically and then stopped: the link was cut on purpose after
  // ChangeKey (interrupted-write test), so what the 1.7.x code would send next never went out.
  if (best.firstDiff === ex.length) return { verdict: 'MATCH', partial: true, note: 'identical up to the cut link' };
  return {
    verdict: 'MISMATCH',
    firstDifference: {
      exchange: best.firstDiff + 1,
      server: ex[best.firstDiff]?.tx ?? '(server sent nothing)',
      reference: best.replayed.tx[best.firstDiff] ?? '(1.7.x code sent nothing)',
    },
  };
}

// The conversation in the repo's reference-recordings format.
function recordingOf({ conversation, kind, operation, complete, best, randoms }) {
  const ex = conversation.exchanges;
  const keyHex = best.key.hex;
  const keepsStoredKey = (operation === 'tap' || operation === 'reset') && keyHex !== FACTORY;
  return {
    name: `real-${kind}-${operation}-${conversation.id}`,
    cardKind: kind,
    operation,
    success: operation === 'tap-wrong-key' ? false : complete && ex.at(-1)?.rx?.endsWith('9100') === true,
    storedKey: keepsStoredKey ? keyHex : '',
    newKey: operation === 'enroll' ? keyHex : '',
    wrongKey: operation === 'tap-wrong-key' ? keyHex : '',
    randomBytesConsumed: randoms.join(''),
    exchanges: ex.map((e) => ({ tx: e.tx, rx: e.rx ?? '' })),
  };
}

// The operation of a conversation: the override, a reset whose link was cut before ChangeKey (only the
// factory probe told it apart), or the guess.
function operationOf(conversation, auths, probe, opOverrides) {
  const cutReset = probe > 0 && !conversation.exchanges.some(isChangeKey);
  return opOverrides[conversation.id] ?? (cutReset ? 'reset' : guessOperation(conversation, auths));
}

// context: {keys, opOverrides, replay(spec) -> {tx, ok, exhausted, randomUsed}}
export function compareOne(original, { keys, opOverrides = {}, replay }) {
  const { conversation, probe } = withoutFactoryProbe(original, analyse(original, keys));
  const ex = conversation.exchanges;
  const auths = analyse(conversation, keys);
  const operation = operationOf(conversation, auths, probe, opOverrides);
  const kind = cardKind(conversation);
  const complete = ex.every((e) => e.rx !== null);
  const result = {
    conversation: conversation.id,
    operation,
    cardKind: kind,
    exchanges: ex.length,
    complete,
    ...(probe ? { factoryProbeExchangesIgnored: probe } : {}),
  };
  // A card that went away mid-conversation: compare what was answered, mark it partial.
  if (!complete) result.partial = true;
  const randoms = auths.filter((a) => a.rndA).map((a) => a.rndA);
  const keyNo = replayKeyNo(operation, ex, auths);
  const attempts = replayCandidates(operation, auths, keys).map((candidate) => {
    const replayed = replay(replaySpec({ kind, operation, keyNo, candidate, randoms, ex }));
    return { key: candidate, replayed, firstDiff: firstDifference(replayed.tx, ex) };
  });
  const best = bestAttempt(attempts);
  result.keyUsed = best.key.label;
  result.randomBytesRecovered = randoms.length * 16;
  result.referenceExchanges = best.replayed.tx.length;
  result.replayOutcome = replayOutcome(best.replayed);
  Object.assign(result, verdict(best, ex));
  result.recording = recordingOf({ conversation, kind, operation, complete, best, randoms });
  return result;
}

export function summaryLine(r) {
  const partial = r.partial ? ' (partial)' : '';
  const diff =
    r.verdict === 'MISMATCH'
      ? `  first diff at exchange ${r.firstDifference.exchange}: server ${r.firstDifference.server} vs 1.7.x ${r.firstDifference.reference}`
      : '';
  return `${r.verdict.padEnd(8)} ${r.cardKind.padEnd(7)} ${r.operation.padEnd(13)} conv ${r.conversation} ${r.exchanges} exchanges${partial}${diff}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = dirname(fileURLToPath(import.meta.url));
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(args.out ?? '.');
  mkdirSync(outDir, { recursive: true });
  const context = {
    keys: loadKeys(args.keys),
    opOverrides: args.ops ? JSON.parse(readFileSync(args.ops, 'utf8')) : {},
    replay: replayRunner(resolve(args.replay ?? join(here, 'build/replay')), outDir),
  };
  if (!existsSync(args.wiretap)) {
    console.log('no wiretap file: nothing to compare');
    process.exit(0);
  }
  const all = conversations(args.wiretap).filter((c) => c.exchanges.length >= 2);
  const only = args.only ? new Set(args.only.split(',')) : null;
  const results = [];
  for (const c of all) {
    if (only && !only.has(c.id)) continue;
    const { recording, ...summary } = compareOne(c, context);
    results.push(summary);
    writeFileSync(join(outDir, `${recording.name}.json`), JSON.stringify(recording, null, 2) + '\n');
  }
  writeFileSync(join(outDir, 'comparison.json'), JSON.stringify(results, null, 2) + '\n');
  for (const r of results) console.log(summaryLine(r));
  const bad = results.filter((r) => r.verdict !== 'MATCH' && !r.partial);
  const matches = results.filter((r) => r.verdict === 'MATCH').length;
  const partials = results.filter((r) => r.partial).length;
  console.log(
    `${results.length} conversations, ${matches} match, ${bad.length} mismatch (complete), ${partials} partial`,
  );
  process.exit(bad.length ? 1 : 0);
}
