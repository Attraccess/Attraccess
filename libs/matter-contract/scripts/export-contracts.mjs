// Writes the OpenAPI 3.1 and JSON Schema documents. Output is deterministic and never committed.
// The TypeScript sources are bundled with esbuild into a scratch directory next to the output.
import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? 'dist/contracts/matter');
const scratch = join(outDir, '..', '.matter-contract-build');

mkdirSync(outDir, { recursive: true });
await build({
  entryPoints: [join(here, '../src/artifacts.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  outfile: join(scratch, 'artifacts.cjs'),
  logLevel: 'silent',
});
const { buildJsonSchemaDocument, buildOpenApiDocument, serializeArtifact } = createRequire(import.meta.url)(
  join(scratch, 'artifacts.cjs'),
);
writeFileSync(join(outDir, 'openapi.json'), serializeArtifact(buildOpenApiDocument()));
writeFileSync(join(outDir, 'json-schema.json'), serializeArtifact(buildJsonSchemaDocument()));
rmSync(scratch, { recursive: true, force: true });
process.stdout.write(`Wrote Matter contract artifacts to ${outDir}\n`);
