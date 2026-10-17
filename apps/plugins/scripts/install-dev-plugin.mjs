// Stages a built plugin for discovery on the next dev API startup.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export function resolvePluginDir(workspaceRoot, env = process.env) {
  return resolve(workspaceRoot, env.PLUGIN_DIR ?? join(env.STORAGE_ROOT ?? 'storage', 'plugins'));
}

export function installDevPlugin(source, pluginDir) {
  const manifest = JSON.parse(readFileSync(join(source, 'plugin.json'), 'utf8'));
  const name = manifest.name;
  if (
    typeof name !== 'string' ||
    !name ||
    basename(name) !== name ||
    name.startsWith('.') ||
    name.startsWith('npm-') ||
    name.includes('\\')
  ) {
    throw new Error('Plugin manifest must have a safe, non-npm-managed directory name.');
  }
  // Fail before touching an existing installation if the build is incomplete.
  for (const entry of Object.values(manifest.main ?? {})) {
    for (const file of [entry.entryPoint, entry.styles].filter(Boolean)) {
      const entryPath = resolve(source, entry.directory, file);
      if (relative(resolve(source), entryPath).startsWith('..') || !existsSync(entryPath)) {
        throw new Error(`Missing or invalid built plugin entry: ${entryPath}. Run the build target first.`);
      }
    }
  }

  mkdirSync(pluginDir, { recursive: true });
  const staging = mkdtempSync(join(pluginDir, `.${name}-dev-`));
  const target = join(pluginDir, name);
  const backup = join(staging, 'previous');
  let installed = false;
  try {
    const stagedPackage = join(staging, 'package');
    cpSync(source, stagedPackage, { recursive: true });
    if (existsSync(target)) renameSync(target, backup);
    try {
      renameSync(stagedPackage, target);
      installed = true;
    } catch (error) {
      if (existsSync(backup)) renameSync(backup, target);
      throw error;
    }
  } finally {
    // Keep the previous package recoverable if restoring it also failed.
    if (installed || !existsSync(backup)) rmSync(staging, { recursive: true, force: true });
  }
  return target;
}

function main() {
  const { values } = parseArgs({ options: { src: { type: 'string' } } });
  if (!values.src) throw new Error('usage: install-dev-plugin.mjs --src <built-package-dir>');
  const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const envFile = join(workspaceRoot, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const target = installDevPlugin(resolve(workspaceRoot, values.src), resolvePluginDir(workspaceRoot));
  process.stdout.write(`Installed dev plugin in ${target}. Restart a running API with pnpm serve to load it.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
