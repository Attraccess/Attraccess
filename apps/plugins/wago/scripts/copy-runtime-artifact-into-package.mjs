import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const releaseRoot = resolve(import.meta.dirname, '..', 'runtime-release');
const releases = existsSync(releaseRoot)
  ? readdirSync(releaseRoot)
      .map((name) => join(releaseRoot, name))
      .filter((path) => statSync(path).isDirectory() && basename(path).startsWith('cc100-'))
  : [];

if (releases.length !== 1) {
  throw new Error(
    `Expected exactly one staged signed WAGO runtime release in ${releaseRoot}; found ${releases.length}`,
  );
}

const destination = resolve(import.meta.dirname, '..', 'package', 'dist', 'wago-cc100-runtime');
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
for (const file of ['wago-cc100-runtime.tar', 'wago-cc100-runtime.tar.sha256', 'wago-cc100-runtime.tar.sig']) {
  const source = join(releases[0], file);
  if (!existsSync(source) || !statSync(source).isFile())
    throw new Error(`Missing signed WAGO runtime release file: ${source}`);
  copyFileSync(source, join(destination, file.replace('wago-cc100-runtime', 'runtime')));
}
