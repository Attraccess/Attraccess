import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import Module from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as semver from 'semver';
import * as tar from 'tar';

const [packageDir, ...entries] = process.argv.slice(2);
if (!packageDir || entries.length === 0) {
  throw new Error('usage: verify-packed-plugin.mjs <package-dir> <required-entry> [...]');
}

const root = resolve(packageDir);
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const hostVersion = JSON.parse(readFileSync(join(workspace, 'package.json'), 'utf8')).version;
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
  validatePackageContract(pkg, hostVersion);

  for (const entry of Object.values(pkg.attraccess ?? {})) {
    if (typeof entry === 'string' && entry.includes('/') && !existsSync(join(extracted, entry))) {
      throw new Error(`Packed plugin entry is unreadable: ${entry}`);
    }
  }

  // Match the host's SDK and shared packages while loading the backend from the
  // extracted tarball, not from the monorepo build directory.
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

function validatePackageContract(pkg, hostVersion) {
  if (typeof pkg.name !== 'string' || !pkg.name) throw new Error('Packed plugin is missing its npm name');
  if (typeof pkg.version !== 'string' || !pkg.version) throw new Error('Packed plugin is missing its version');
  if (!pkg.keywords?.includes('attraccess-plugin'))
    throw new Error('Packed plugin is missing the attraccess-plugin keyword');
  if (!pkg.repository || !pkg.homepage || !pkg.license)
    throw new Error('Packed plugin is missing repository, homepage, or license metadata');

  const metadata = pkg.attraccess;
  if (!metadata?.displayName || !metadata.host || !Array.isArray(metadata.permissions) || !metadata.sdk)
    throw new Error('Packed plugin is missing required Attraccess metadata');
  if (!semver.validRange(metadata.host) || !semver.satisfies(hostVersion, metadata.host, { includePrerelease: true }))
    throw new Error(`Packed plugin is not compatible with Attraccess ${hostVersion}`);

  for (const [entry, sdk] of [
    ['backend', 'backend'],
    ['frontend', 'frontend'],
  ]) {
    if (!metadata[entry]) continue;
    const dependency = `@attraccess/plugins-${sdk}-sdk`;
    const sdkRange = metadata.sdk[sdk];
    const peerRange = pkg.peerDependencies?.[dependency];
    if (
      !semver.validRange(sdkRange) ||
      !semver.validRange(peerRange) ||
      !semver.intersects(sdkRange, peerRange) ||
      !semver.satisfies(hostVersion, sdkRange, { includePrerelease: true }) ||
      !semver.satisfies(hostVersion, peerRange, { includePrerelease: true })
    )
      throw new Error(`Packed plugin must declare ${dependency} as a compatible peer dependency`);
  }
}
