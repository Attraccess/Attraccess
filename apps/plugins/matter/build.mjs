import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync } from 'node:fs';
const host = JSON.parse(readFileSync('package.json', 'utf8'));
const pkg = JSON.parse(readFileSync('apps/plugins/matter/package.json', 'utf8'));
const legacy = JSON.parse(readFileSync('apps/plugins/matter/plugin.json', 'utf8'));
if (
  pkg.attraccess.host !== host.version ||
  legacy.attraccessVersion.exact !== host.version ||
  pkg.version !== legacy.version ||
  pkg.peerDependencies['@attraccess/plugins-backend-sdk'] !== host.version ||
  pkg.attraccess.sdk.backend !== host.version
)
  throw new Error(
    'Matter plugin manifests drifted from the exact supported host/package release policy. Update both manifests for the supported release.',
  );
execFileSync(
  process.execPath,
  [
    '../scripts/esbuild-backend.mjs',
    '--entry',
    'backend/plugin.ts',
    '--outfile',
    'package/dist/index.js',
    '--tsconfig',
    'tsconfig.json',
  ],
  { cwd: 'apps/plugins/matter', stdio: 'inherit' },
);
for (const file of ['package.json', 'plugin.json'])
  copyFileSync(`apps/plugins/matter/${file}`, `apps/plugins/matter/package/${file}`);
