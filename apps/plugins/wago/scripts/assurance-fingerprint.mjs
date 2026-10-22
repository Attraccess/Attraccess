import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Include uncommitted and untracked implementation, without copying source or secrets into evidence. */
export function sourceFingerprint(root) {
  const files = execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      'apps/plugins/wago',
      'apps/plugins/rabbitmq',
      'libs/plugins-backend-sdk',
      'libs/database-entities',
      'apps/api/src/encryption',
      'package.json',
      'pnpm-lock.yaml',
      'tsconfig.base.json',
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  )
    .split('\0')
    .filter(Boolean)
    .sort();
  const hash = createHash('sha256');
  for (const file of new Set(files)) {
    try {
      hash
        .update(file)
        .update('\0')
        .update(readFileSync(join(root, file)))
        .update('\0');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      hash.update(`${file}\0deleted\0`);
    }
  }
  return hash.digest('hex');
}
