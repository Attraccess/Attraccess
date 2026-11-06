#!/usr/bin/env node
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

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
);
const replayBinary = resolve(args.replay ?? join(here, 'build/replay'));
const outDir = resolve(args.out ?? '.');
mkdirSync(outDir, { recursive: true });

const FACTORY = '00'.repeat(16);
const keys = [{ label: 'factory', hex: FACTORY }];
if (args.keys && existsSync(args.keys)) for (const k of JSON.parse(readFileSync(args.keys, 'utf8'))) if (!keys.some((x) => x.hex === k.hex)) keys.push(k);
const opOverrides = args.ops ? JSON.parse(readFileSync(args.ops, 'utf8')) : {};

const aesCbcDecrypt = (key, data) => {
  const d = createDecipheriv('aes-128-cbc', Buffer.from(key, 'hex'), Buffer.alloc(16));
  d.setAutoPadding(false);
  return Buffer.concat([d.update(data), d.final()]);
};

// ---- conversations from the wiretap ---------------------------------------------------------
function conversations(path) {
  const byId = new Map();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.startsWith('{')) continue;
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    const p = m.payload;
    if (m.type === 'CARD_APDU' && m.dir === 's2r' && p) {
      if (!byId.has(p.conversationId)) byId.set(p.conversationId, { id: p.conversationId, t: m.t, detectionId: p.detectionId, exchanges: [], ended: false });
      byId.get(p.conversationId).exchanges.push({ seq: p.seq, tx: String(p.apdu).toLowerCase(), rx: null });
    } else if (m.type === 'CARD_APDU_RESPONSE' && m.dir === 'r2s' && p) {
      const c = byId.get(p.conversationId);
      const e = c?.exchanges.find((x) => x.seq === p.seq);
      if (e) e.rx = String(p.response).toLowerCase();
    } else if (m.type === 'CARD_CONVERSATION_END' && m.dir === 's2r' && p) {
      const c = byId.get(p.conversationId);
      if (c) c.ended = true;
    }
  }
  return [...byId.values()];
}

// ---- reading the conversation ---------------------------------------------------------------
const ev2First = (tx) => tx.startsWith('9071000005');
const stripStatus = (rx) => rx.slice(0, -4);

function analyse(conversation) {
  const ex = conversation.exchanges;
  const auths = []; // {index, keyNo, key, rndA}
  for (let i = 0; i < ex.length; i++) {
    if (!ev2First(ex[i].tx) || !ex[i].rx || !ex[i].rx.endsWith('91af')) continue;
    const next = ex[i + 1];
    const keyNo = parseInt(ex[i].tx.slice(10, 12), 16);
    const entry = { index: i, keyNo, key: null, rndA: null, complete: !!next && next.tx.startsWith('90af000020') };
    if (entry.complete) {
      const part1 = Buffer.from(stripStatus(ex[i].rx), 'hex');
      const part2 = Buffer.from(next.tx.slice(10, 10 + 64), 'hex');
      for (const k of keys) {
        const rndB = aesCbcDecrypt(k.hex, part1);
        const plain = aesCbcDecrypt(k.hex, part2);
        const rotated = Buffer.concat([rndB.subarray(1), rndB.subarray(0, 1)]);
        if (plain.subarray(16).equals(rotated)) { entry.key = k; entry.rndA = plain.subarray(0, 16).toString('hex'); break; }
      }
    }
    auths.push(entry);
  }
  return auths;
}

function guessOperation(conversation, auths) {
  const ex = conversation.exchanges;
  const hasChangeKey = ex.some((e) => e.tx.startsWith('90c4'));
  if (!hasChangeKey) {
    const last = auths.at(-1);
    return last && !last.key ? 'tap-wrong-key' : 'tap';
  }
  const probesKeyVersions = ex.some((e) => e.tx.startsWith('9064'));
  const firstAuthKeyNo = auths[0]?.keyNo;
  // Enroll looks for a free slot first (DESFire: GetKeyVersion, NTAG424: authenticates slots 1..5 with
  // the factory key); reset authenticates the master key and goes straight to ChangeKey.
  if (probesKeyVersions) return 'enroll';
  // Enroll looks for a free slot: the factory key is accepted there (9100 after the second auth frame).
  // Reset first tries the factory key on the card's slot to see whether it is already factory; the card
  // refuses it (91ae) and the master key login follows.
  const first = auths[0];
  const firstAccepted = first ? ex[first.index + 1]?.rx?.endsWith('9100') === true : false;
  if (first && firstAuthKeyNo !== 0 && firstAccepted) return 'enroll';
  return 'reset';
}

function cardKind(conversation) {
  const rx = conversation.exchanges[0]?.rx ?? '';
  return rx.slice(2, 4) === '04' ? 'ntag424' : 'desfire';
}

function runReplay(spec) {
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
}

// The server's reset first tries the factory key on the card's slot (select, AuthenticateEV2First and its
// second frame) so a reset that already got through is recognised on the next tap. The 1.7.x firmware has
// no such step; it is the one intended difference, so it is cut out before the byte comparison.
function withoutFactoryProbe(conversation, auths) {
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

function compareOne(original) {
  const { conversation, probe } = withoutFactoryProbe(original, analyse(original));
  const ex = conversation.exchanges;
  const auths = analyse(conversation);
  const cutReset = probe > 0 && !conversation.exchanges.some((e) => e.tx.startsWith('90c4'));
  const operation = opOverrides[conversation.id] ?? (cutReset ? 'reset' : guessOperation(conversation, auths));
  const kind = cardKind(conversation);
  const result = { conversation: conversation.id, operation, cardKind: kind, exchanges: ex.length, complete: ex.every((e) => e.rx !== null), ...(probe ? { factoryProbeExchangesIgnored: probe } : {}) };
  if (!result.complete) {
    // A card that went away mid-conversation: compare what was answered, mark it partial.
    result.partial = true;
  }
  const randoms = auths.filter((a) => a.rndA).map((a) => a.rndA);
  // Key candidates for the replay: tap = the key that authenticated; reset = the old key (tried from the
  // list, the one that reproduces the server's ChangeKey wins); enroll = the new key (the key of the last auth).
  const nonFactory = keys.filter((k) => k.hex !== FACTORY);
  const attempts = [];
  const keyNo = operation === 'tap' || operation === 'tap-wrong-key' ? (auths.at(-1)?.keyNo ?? 1) : (ex.find((e) => e.tx.startsWith('90c4'))?.tx ? Number.parseInt(auths.at(-1)?.keyNo ?? 1, 10) : 1);
  const candidates =
    operation === 'tap' ? [auths.at(-1)?.key].filter(Boolean)
    : operation === 'tap-wrong-key' ? nonFactory.slice(0, 1)
    : nonFactory.length ? nonFactory : [{ label: 'none', hex: FACTORY }];
  for (const candidate of candidates.length ? candidates : [{ label: 'none', hex: FACTORY }]) {
    const rndSpec = randoms.join('');
    const spec = [
      `kind ${kind}`, `op ${operation === 'tap-wrong-key' ? 'tap' : operation}`, `keyno ${keyNo}`,
      `key ${candidate.hex}`, `newkey ${candidate.hex}`, `rnd ${rndSpec}`,
      ...ex.map((e) => `rx ${e.rx ?? 'none'}`),
    ].join('\n');
    const replayed = runReplay(spec);
    let firstDiff = -1;
    const n = Math.max(replayed.tx.length, ex.length);
    for (let i = 0; i < n; i++) {
      if (replayed.tx[i] !== ex[i]?.tx) { firstDiff = i; break; }
    }
    attempts.push({ key: candidate, replayed, firstDiff });
  }
  const best = attempts.sort((a, b) => (a.firstDiff === -1 ? Infinity : a.firstDiff) < (b.firstDiff === -1 ? Infinity : b.firstDiff) ? 1 : -1)[0];
  result.keyUsed = best.key.label;
  result.randomBytesRecovered = randoms.length * 16;
  result.referenceExchanges = best.replayed.tx.length;
  result.replayOutcome = best.replayed.ok ? 'ok' : best.replayed.exhausted ? 'ran out of captured answers' : 'refused';
  if (best.firstDiff === -1) {
    result.verdict = 'MATCH';
  } else if (best.firstDiff === ex.length) {
    // The server sent every command identically and then stopped: the link was cut on purpose after
    // ChangeKey (interrupted-write test), so what the 1.7.x code would send next never went out.
    result.verdict = 'MATCH';
    result.partial = true;
    result.note = 'identical up to the cut link';
  } else {
    result.verdict = 'MISMATCH';
    result.firstDifference = {
      exchange: best.firstDiff + 1,
      server: ex[best.firstDiff]?.tx ?? '(server sent nothing)',
      reference: best.replayed.tx[best.firstDiff] ?? '(1.7.x code sent nothing)',
    };
  }
  // The recording in the repo's format.
  const stored = operation === 'tap' || operation === 'reset' ? (best.key.hex !== FACTORY ? best.key.hex : '') : '';
  result.recording = {
    name: `real-${kind}-${operation}-${conversation.id}`,
    cardKind: kind,
    operation,
    success: operation === 'tap-wrong-key' ? false : result.complete && ex.at(-1)?.rx?.endsWith('9100') === true,
    storedKey: stored,
    newKey: operation === 'enroll' ? best.key.hex : '',
    wrongKey: operation === 'tap-wrong-key' ? best.key.hex : '',
    randomBytesConsumed: randoms.join(''),
    exchanges: ex.map((e) => ({ tx: e.tx, rx: e.rx ?? '' })),
  };
  return result;
}

if (!existsSync(args.wiretap)) { console.log('no wiretap file: nothing to compare'); process.exit(0); }
const all = conversations(args.wiretap).filter((c) => c.exchanges.length >= 2);
const only = args.only ? new Set(args.only.split(',')) : null;
const results = [];
for (const c of all) {
  if (only && !only.has(c.id)) continue;
  const r = compareOne(c);
  const { recording, ...summary } = r;
  results.push(summary);
  writeFileSync(join(outDir, `${recording.name}.json`), JSON.stringify(recording, null, 2) + '\n');
}
writeFileSync(join(outDir, 'comparison.json'), JSON.stringify(results, null, 2) + '\n');
for (const r of results) {
  console.log(
    `${r.verdict.padEnd(8)} ${r.cardKind.padEnd(7)} ${r.operation.padEnd(13)} conv ${r.conversation} ${r.exchanges} exchanges` +
      (r.partial ? ' (partial)' : '') + (r.verdict === 'MISMATCH' ? `  first diff at exchange ${r.firstDifference.exchange}: server ${r.firstDifference.server} vs 1.7.x ${r.firstDifference.reference}` : ''),
  );
}
const bad = results.filter((r) => r.verdict !== 'MATCH' && !r.partial);
console.log(`${results.length} conversations, ${results.filter((r) => r.verdict === 'MATCH').length} match, ${bad.length} mismatch (complete), ${results.filter((r) => r.partial).length} partial`);
process.exit(bad.length ? 1 : 0);
