import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Containerd-backed Docker stores can report an OCI index as image inspect .Id.
// Classic Docker on the CC100 uses the config digest carried by docker save.
export function savedImageIdentity(archive, image) {
  const member = (name) => execFileSync('tar', ['-xOf', archive, name], { maxBuffer: 1024 * 1024 });
  const entries = JSON.parse(member('manifest.json').toString('utf8'));
  if (!Array.isArray(entries) || entries.length !== 1 || !entries[0].RepoTags?.includes(image)) {
    throw new Error('Expected exactly one tagged runtime image in the Docker archive');
  }
  const configPath = entries[0].Config;
  if (typeof configPath !== 'string' || !/^(?:blobs\/sha256\/([a-f0-9]{64})|([a-f0-9]{64})\.json)$/.test(configPath)) {
    throw new Error('Invalid Docker image config path');
  }
  const configBytes = member(configPath);
  const digest = createHash('sha256').update(configBytes).digest('hex');
  if (!configPath.includes(digest)) throw new Error('Docker config digest does not match its content');
  const config = JSON.parse(configBytes.toString('utf8'));
  if (config.os !== 'linux' || config.architecture !== 'arm' || config.variant !== 'v7') {
    throw new Error('Saved runtime image must target Linux ARMv7');
  }
  return `sha256:${digest}`;
}
