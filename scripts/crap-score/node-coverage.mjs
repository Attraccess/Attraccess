// Loaded into Node tests and their child processes via NODE_OPTIONS.
import { registerHooks } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInstrumenter } from 'istanbul-lib-instrument';

const manifest = JSON.parse(readFileSync(process.env.CRAP_NODE_MANIFEST, 'utf8'));
const sources = new Set(manifest.files);

function sourceIdentity(url, source) {
  if (!url.startsWith('file:')) return;
  const file = fileURLToPath(url);
  if (sources.has(file)) return file;
  // CLI tests copy maintained scripts into isolated directories. Only exact,
  // unique source matches may transfer execution counts back to the original.
  const hash = createHash('sha256').update(source).digest('hex');
  const matches = manifest.sourceCopies[hash];
  if (matches?.length === 1) return matches[0];
}

registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (loaded.source == null) return loaded;
    const source = String(loaded.source);
    const file = sourceIdentity(url, source);
    if (!file) return loaded;
    const instrumenter = createInstrumenter({ esModules: true });
    return { ...loaded, source: instrumenter.instrumentSync(source, file) };
  },
});

process.on('exit', () => {
  writeFileSync(
    path.join(manifest.output, `${process.pid}-${randomUUID()}.json`),
    JSON.stringify(globalThis.__coverage__ ?? {}),
  );
});
