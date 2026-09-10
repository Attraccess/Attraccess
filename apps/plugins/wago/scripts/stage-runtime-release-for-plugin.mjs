import { cpSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const source = resolve(import.meta.dirname, '..', '..', '..', '..', 'runtime-release');
const destination = resolve(import.meta.dirname, '..', 'runtime-release');
const releases = existsSync(source)
  ? readdirSync(source)
      .map((name) => join(source, name))
      .filter((path) => statSync(path).isDirectory() && basename(path).startsWith('cc100-'))
  : [];

if (releases.length !== 1) {
  throw new Error(`Expected exactly one signed WAGO runtime release in ${source}; found ${releases.length}`);
}

rmSync(destination, { recursive: true, force: true });
cpSync(releases[0], join(destination, basename(releases[0])), { recursive: true });
