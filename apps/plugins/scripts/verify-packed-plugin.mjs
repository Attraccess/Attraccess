import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import Module from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as tar from 'tar';

const [packageDir, ...entries] = process.argv.slice(2);
if (!packageDir || entries.length === 0) {
  throw new Error('usage: verify-packed-plugin.mjs <package-dir> <required-entry> [...]');
}

const root = resolve(packageDir);
const output = JSON.parse(execFileSync('npm', ['pack', '--json'], { cwd: root, encoding: 'utf8' }))[0];
const archive = join(root, output.filename);
const unpacked = mkdtempSync(join(tmpdir(), 'attraccess-plugin-'));

try {
  const paths = [];
  await tar.t({ file: archive, onReadEntry: (entry) => paths.push(entry.path) });
  for (const entry of entries) {
    if (!paths.includes(`package/${entry}`)) throw new Error(`Packed plugin is missing ${entry}`);
  }

  await tar.x({ file: archive, cwd: unpacked });
  const extracted = join(unpacked, 'package');
  const pkg = JSON.parse(readFileSync(join(extracted, 'package.json'), 'utf8'));
  if (!pkg.keywords?.includes('attraccess-plugin'))
    throw new Error('Packed plugin is missing the attraccess-plugin keyword');

  for (const entry of Object.values(pkg.attraccess ?? {})) {
    if (typeof entry === 'string' && entry.includes('/') && !readFileSync(join(extracted, entry))) {
      throw new Error(`Packed plugin entry is unreadable: ${entry}`);
    }
  }

  // Match the host's SDK and shared packages while loading the backend from the
  // extracted tarball, not from the monorepo build directory.
  const workspace = resolve(root, '../../../..');
  const modules = join(extracted, 'node_modules', '@attraccess');
  mkdirSync(modules, { recursive: true });
  cpSync(join(workspace, 'dist/libs/plugins-backend-sdk'), join(modules, 'plugins-backend-sdk'), { recursive: true });
  for (const library of ['database-entities', 'shared'])
    symlinkSync(join(workspace, 'dist/libs', library), join(modules, library), 'dir');
  process.env.NODE_PATH = join(workspace, 'node_modules');
  Module._initPaths();
  if (pkg.attraccess?.backend) await import(pathToFileURL(join(extracted, pkg.attraccess.backend)).href);
} finally {
  rmSync(archive, { force: true });
  rmSync(unpacked, { recursive: true, force: true });
}
