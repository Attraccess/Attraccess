import { readFileSync } from 'node:fs';
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const policy = json('libs/matter-contract/package.json').attraccessMatter;
const host = json('package.json');
const plugin = json('apps/plugins/matter/package.json');
const legacy = json('apps/plugins/matter/plugin.json');
const sidecar = json('apps/matter-sidecar/package.json');
const release = policy.supportedRelease;
if (
  host.version !== release.attraccess ||
  plugin.version !== release.plugin ||
  sidecar.version !== release.sidecar ||
  plugin.attraccess.host !== release.attraccess ||
  legacy.attraccessVersion.exact !== release.attraccess ||
  legacy.version !== release.plugin ||
  plugin.peerDependencies['@attraccess/plugins-backend-sdk'] !== release.attraccess ||
  plugin.attraccess.sdk.backend !== release.attraccess ||
  sidecar.dependencies['@matter/main'] !== policy.matterJsRelease ||
  sidecar.dependencies['@matter/nodejs'] !== policy.matterJsRelease ||
  host.dependencies['@matter/main'] !== policy.matterJsRelease ||
  host.dependencies['@matter/nodejs'] !== policy.matterJsRelease
)
  throw new Error(
    'Matter release policy and package declarations have drifted. Align the exact supported Attraccess/plugin/sidecar releases and pinned matter.js packages before building.',
  );
