import { ConfigModule } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Keep only host/tool variables. In particular, migrations must never seed real
// mail, payment, Balena, Redis or authentication credentials from the caller.
const hostVariables =
  /^(PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|TMP|TEMP|LANG|LC_.*|TERM|NODE_.*|JEST_.*|NX_.*|CI|npm_.*)$/;
for (const key of Object.keys(process.env)) {
  if (!hostVariables.test(key)) delete process.env[key];
}
export const storageRoot = mkdtempSync(join(tmpdir(), 'attractap-real-api-storage-'));
process.env.STORAGE_ROOT = storageRoot;
process.env.PLUGIN_DIR = join(storageRoot, 'plugins');
mkdirSync(process.env.PLUGIN_DIR);
process.env.DISABLE_PLUGINS = 'true';
process.env.AUTH_SESSION_SECRET = randomBytes(32).toString('hex');
process.env.NODE_ENV = 'test';
process.env.LOG_LEVELS = 'error,warn';
process.env.ATTRACCESS_URL = 'http://127.0.0.1';

// Exercise the real configuration factories, but never import the developer's
// .env file (including in bootstrap's early plugin configuration context).
const forRoot = ConfigModule.forRoot.bind(ConfigModule);
jest.spyOn(ConfigModule, 'forRoot').mockImplementation((options) => forRoot({ ...options, ignoreEnvFile: true }));

// The suite closes Nest/DataSource before invoking this registered owner cleanup.
export function disposeStorage() {
  rmSync(storageRoot, { recursive: true, force: true });
}
