import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { savedImageIdentity } from './docker-image-identity.mjs';

const image = 'ghcr.io/attraccess/wago-cc100-runtime:fixture';
test('reads the config identity from classic and containerd Docker save archives', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wago-image-id-'));
  const bytes = JSON.stringify({ os: 'linux', architecture: 'arm', variant: 'v7' });
  const digest = createHash('sha256').update(bytes).digest('hex');
  const archive = join(root, 'image.tar');
  try {
    await mkdir(join(root, 'blobs/sha256'), { recursive: true });
    for (const configPath of [`${digest}.json`, `blobs/sha256/${digest}`]) {
      await writeFile(join(root, configPath), bytes);
      await writeFile(join(root, 'manifest.json'), JSON.stringify([{ Config: configPath, RepoTags: [image] }]));
      execFileSync('tar', ['-cf', archive, '-C', root, 'manifest.json', configPath]);
      assert.equal(savedImageIdentity(archive, image), `sha256:${digest}`);
    }
    await writeFile(
      join(root, 'manifest.json'),
      JSON.stringify([
        { Config: `${digest}.json`, RepoTags: [image] },
        { Config: `${digest}.json`, RepoTags: ['unexpected:image'] },
      ]),
    );
    execFileSync('tar', ['-cf', archive, '-C', root, 'manifest.json', `${digest}.json`]);
    assert.throws(() => savedImageIdentity(archive, image), /exactly one/);
    await writeFile(join(root, 'manifest.json'), JSON.stringify([{ Config: `${digest}.json`, RepoTags: [image] }]));
    await writeFile(join(root, `${digest}.json`), 'corrupted');
    execFileSync('tar', ['-cf', archive, '-C', root, 'manifest.json', `${digest}.json`]);
    assert.throws(() => savedImageIdentity(archive, image), /digest does not match/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
