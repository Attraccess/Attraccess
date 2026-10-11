import { join, resolve } from 'node:path';
import { z } from 'zod';

/** Runtime, migrations and development tools resolve relative storage paths from the same working directory. */
export function resolveStorageRoot(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  const configured = z.string().default(join(cwd, 'storage')).parse(env.STORAGE_ROOT);
  return resolve(cwd, configured);
}

export function resolveDatabasePath(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  return join(resolveStorageRoot(env, cwd), 'attraccess.sqlite');
}
