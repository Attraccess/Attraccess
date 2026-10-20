import { parse } from 'yaml';

// External imports of the runtime/shared Modbus code, plus the Nx bundle toolchain.
// Keep this list aligned with build-cc100-runtime-esbuild and its source imports.
const roots = ['mqtt', 'ipaddr.js', 'nx', '@nx/esbuild', 'esbuild', 'typescript'];

/** Only dependency resolutions reachable by the runtime/build can change its artifact. */
export function runtimeDependencies(read) {
  const manifest = JSON.parse(read('package.json'));
  const lock = parse(read('pnpm-lock.yaml'));
  if (lock.lockfileVersion !== '9.0' || !lock.importers?.['.'] || !lock.snapshots || !lock.packages) {
    throw new Error('Unsupported CC100 dependency lockfile; update the runtime release check.');
  }
  const importer = lock.importers['.'];
  const direct = {};
  const packages = {};
  const snapshots = {};
  const visit = (name, version) => {
    const key = `${name}@${version}`;
    if (Object.hasOwn(snapshots, key)) return;
    const snapshot = lock.snapshots[key];
    const packageKey = key.split('(')[0];
    if (!snapshot || !lock.packages[packageKey]) throw new Error(`Missing CC100 dependency: ${key}`);
    snapshots[key] = snapshot;
    packages[packageKey] = lock.packages[packageKey];
    for (const [dependency, resolution] of Object.entries({
      ...snapshot.dependencies,
      ...snapshot.optionalDependencies,
    })) {
      visit(dependency, resolution);
    }
  };
  for (const name of roots) {
    const dependency = importer.dependencies?.[name] ?? importer.devDependencies?.[name];
    if (!dependency) throw new Error(`Missing CC100 root dependency: ${name}`);
    direct[name] = dependency;
    visit(name, dependency.version);
  }
  return {
    direct,
    packages,
    snapshots,
    // Installation/toolchain policy remains conservative, including patches and overrides.
    packageManager: manifest.packageManager,
    engines: manifest.engines,
    pnpm: manifest.pnpm,
    settings: lock.settings,
    overrides: lock.overrides,
    patchedDependencies: lock.patchedDependencies,
  };
}
