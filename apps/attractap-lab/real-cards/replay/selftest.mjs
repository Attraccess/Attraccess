#!/usr/bin/env node
// Self-test of the replay comparison: the repo's own reference recordings, turned into a wiretap
// file, must compare as MATCH (the recordings are what the 1.7.x code sent against a virtual card),
// and a tampered server APDU must be reported as a MISMATCH at the right exchange.
//   node selftest.mjs   (after ./replay.sh)
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const recordings = join(here, '../../../attractap/firmware/tests/reference-recordings/recordings');
const work = mkdtempSync(join(tmpdir(), 'replay-selftest-'));
const lines = [], keys = [], ops = {};
let failures = 0;
for (const file of readdirSync(recordings).filter((f) => f.endsWith('.json'))) {
  const rec = JSON.parse(readFileSync(join(recordings, file), 'utf8'));
  if (rec.operation === 'tap-wrong-key') continue;
  for (const k of [rec.storedKey, rec.newKey]) if (k) keys.push({ label: `${rec.name} key`, hex: k });
  ops[rec.name] = rec.operation;
  rec.exchanges.forEach((e, i) => {
    lines.push(JSON.stringify({ type: 'CARD_APDU', dir: 's2r', payload: { conversationId: rec.name, detectionId: 1, seq: i + 1, apdu: e.tx } }));
    lines.push(JSON.stringify({ type: 'CARD_APDU_RESPONSE', dir: 'r2s', payload: { conversationId: rec.name, seq: i + 1, response: e.rx } }));
  });
}
writeFileSync(join(work, 'wiretap.jsonl'), lines.join('\n') + '\n');
writeFileSync(join(work, 'keys.json'), JSON.stringify(keys));
writeFileSync(join(work, 'ops.json'), JSON.stringify(ops));
const run = (wiretap) => spawnSync('node', [join(here, 'compare.mjs'), '--wiretap', wiretap, '--keys', join(work, 'keys.json'), '--ops', join(work, 'ops.json'), '--out', join(work, 'out')], { encoding: 'utf8' });

const good = run(join(work, 'wiretap.jsonl'));
process.stdout.write(good.stdout);
if (good.status !== 0 || /MISMATCH/.test(good.stdout)) { console.error('FAIL: reference recordings do not compare as MATCH'); failures++; }

// Tamper with the 6th server APDU of the first recording.
const tampered = lines.slice();
const idx = tampered.findIndex((l) => JSON.parse(l).type === 'CARD_APDU' && JSON.parse(l).payload.seq === 6);
const message = JSON.parse(tampered[idx]);
message.payload.apdu = message.payload.apdu.slice(0, -2) + 'ff';
tampered[idx] = JSON.stringify(message);
writeFileSync(join(work, 'tampered.jsonl'), tampered.join('\n') + '\n');
const bad = run(join(work, 'tampered.jsonl'));
if (!/MISMATCH.*first diff at exchange 6/.test(bad.stdout)) { console.error('FAIL: a tampered server APDU was not reported at exchange 6\n' + bad.stdout); failures++; }
else console.log('OK: tampered APDU reported:', bad.stdout.split('\n').find((l) => /MISMATCH/.test(l)));
process.exit(failures ? 1 : 0);
