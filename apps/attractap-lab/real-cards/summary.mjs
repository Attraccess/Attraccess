#!/usr/bin/env node
// Writes summary.md for a run folder: per card step results, per-exchange PN532 failure rate per card
// type, how long the person was needed, and the replay verdict per conversation.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const read = (name) => (existsSync(join(dir, name)) ? JSON.parse(readFileSync(join(dir, name), 'utf8')) : null);
const report = read('session-report.json');
const comparison = read('comparison.json') ?? [];
const out = [];
if (!report) out.push('# Real-card session\n\nNo session report: the session did not finish.');
else {
  out.push(`# Real-card session (${report.mode})\n`);
  out.push(`- setup (flash, pair): ${report.setup_seconds} s; card session: ${report.card_session_seconds} s; prompts: ${report.prompts}; time spent waiting for cards: ${report.seconds_waiting_for_cards} s\n`);
  out.push('## PN532 exchange failures per card type\n');
  out.push('| card | exchanges | answered | PN532 failures | failure rate | statuses |\n|---|---|---|---|---|---|');
  for (const c of report.cards) out.push(`| ${c.card} | ${c.rf.exchanges} | ${c.rf.answered} | ${c.rf.pn532_failures} | ${c.rf.failure_rate === null ? '-' : (c.rf.failure_rate * 100).toFixed(1) + ' %'} | ${c.rf.statuses.join(' ') || '-'} |`);
  out.push('\n## Steps\n');
  for (const c of report.cards) {
    out.push(`### ${c.card}\n`);
    for (const [label, s] of Object.entries(c.steps)) out.push(`- ${s.ok ? 'PASS' : 'FAIL'} ${label} (${s.seconds} s)${s.error ? ': ' + s.error : ''}`);
    out.push('');
  }
}
out.push('## Replay of the 1.7.x card code against the captured conversations\n');
if (!comparison.length) out.push('No conversations compared.');
else {
  out.push('| verdict | card | operation | conversation | exchanges | first difference |\n|---|---|---|---|---|---|');
  for (const r of comparison) out.push(`| ${r.verdict}${r.partial ? ' (partial)' : ''} | ${r.cardKind} | ${r.operation} | ${r.conversation} | ${r.exchanges} | ${r.firstDifference ? `#${r.firstDifference.exchange}: server ${r.firstDifference.server} vs 1.7.x ${r.firstDifference.reference}` : '-'} |`);
}
writeFileSync(join(dir, 'summary.md'), out.join('\n') + '\n');
console.log(out.join('\n'));
