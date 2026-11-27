// Runs as appuser in the runtime stage of the root Dockerfile and fails the image build when the slim image
// lacks something the server needs, or ships something that was removed on purpose.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import path from 'node:path';

// Compiled into main.js; the plugin loader hands plugins that instance (see HOST_BUNDLED_MODULES in the API).
const hostBundled = new Set(['@attraccess/plugins-backend-sdk']);

export const devOnlyPackages = [
  '@nestjs/schematics',
  '@nestjs/testing',
  'identity-obj-proxy',
  'swagger-typescript-api',
];
// Not a dependency of the API itself, but runtime packages (the mailer, mjml) bring their own copy.
export const transitiveOnlyPackages = ['glob'];

// The WAGO plugin spawns the OpenSSH tools (apps/plugins/wago/backend: runtime/managed/transport/ssh.ts,
// commissioning/delivery/upload.ts). The rest: entrypoint.sh and the monitoring-init command of
// coolify.docker-compose.yml and docker-compose.balena.yml with the monitoring/grafana/*.sh it runs.
export const requiredCommands = [
  'ssh',
  'ssh-agent',
  'ssh-add',
  'ssh-keygen',
  'ssh-keyscan',
  'gosu',
  'sh',
  'sleep',
  'cp',
  'rm',
  'sed',
  'awk',
  'comm',
  'sort',
  'mktemp',
  'mkdir',
  'dirname',
  'stat',
  'id',
  'chown',
];

const requiredFiles = ['/etc/ssl/certs/ca-certificates.crt', '/usr/share/zoneinfo/Europe/Berlin'];

// Leftovers the image used to ship: the swagger build (a second copy of the API assets), library builds,
// and the Python-linked GDB variants, which cannot run without libpython.
export function shippedLeftovers(distDirectory = '/app/dist', gdbDirectory = '/opt/esp-gdb') {
  const found = ['apps/api-swagger', 'libs']
    .map((entry) => path.join(distDirectory, entry))
    .filter((entry) => fs.existsSync(entry));
  for (const toolchain of fs.existsSync(gdbDirectory) ? fs.readdirSync(gdbDirectory) : []) {
    const bin = path.join(gdbDirectory, toolchain, 'bin');
    if (!fs.existsSync(bin)) continue;
    found.push(
      ...fs
        .readdirSync(bin)
        .filter((file) => /-gdb-3\./.test(file))
        .map((file) => path.join(bin, file)),
    );
  }
  return found;
}

/** Every package a bundle requires by name, without Node built-ins, relative paths and bundled libraries. */
export function requiredPackages(source) {
  const names = new Set();
  for (const line of source.split('\n')) {
    if (/^\s*(\/\/|\/?\*)/.test(line)) continue;
    for (const [, , name] of line.matchAll(/(?<![.\w])require\(\s*(["'])([^"'\n]+)\1\s*\)/g)) {
      if (!isBuiltin(name) && !/^[./]/.test(name) && !hostBundled.has(name)) names.add(name);
    }
  }
  return [...names].sort();
}

export function unresolvablePackages(entryFile) {
  const { resolve } = createRequire(entryFile);
  const names = requiredPackages(fs.readFileSync(entryFile, 'utf8'));
  if (!names.length) throw new Error(`No package requires found in ${entryFile}, so none were checked`);
  return names.filter((name) => {
    try {
      resolve(name);
      return false;
    } catch {
      return true;
    }
  });
}

/** Direct dependencies, plus pnpm's store (which also holds the transitive ones) for the development-only packages. */
export function installedDevOnlyPackages(modulesDirectory) {
  const store = path.join(modulesDirectory, '.pnpm');
  const stored = fs.existsSync(store) ? fs.readdirSync(store) : [];
  const direct = (name) => fs.existsSync(path.join(modulesDirectory, name));
  return [
    ...devOnlyPackages.filter(
      (name) => direct(name) || stored.some((entry) => entry.startsWith(`${name.replace('/', '+')}@`)),
    ),
    ...transitiveOnlyPackages.filter(direct),
  ];
}

export function missingCommands(commands, searchPath = process.env.PATH ?? '') {
  return commands.filter(
    (command) =>
      !searchPath.split(path.delimiter).some((directory) => {
        try {
          fs.accessSync(path.join(directory, command), fs.constants.X_OK);
          return true;
        } catch {
          return false;
        }
      }),
  );
}

function assertNone(problem, found) {
  if (found.length) throw new Error(`${problem}: ${found.join(', ')}`);
}

function loadNativeAddons(apiDirectory) {
  const apiRequire = createRequire(path.join(apiDirectory, 'main.js'));
  apiRequire('bcrypt').hashSync('probe', 4);
  apiRequire('sharp'); // loads libvips
  const Database = apiRequire('better-sqlite3');
  new Database(':memory:').close();
  // A dependency of the mailer, so load the copy the mailer resolves.
  const mailer = fs.realpathSync(apiRequire.resolve('@nestjs-modules/mailer'));
  createRequire(mailer)('@css-inline/css-inline').inline('<p>probe</p>');
}

export function main(apiDirectory = '/app/dist/apps/api') {
  assertNone('Packages required by main.js do not resolve', unresolvablePackages(path.join(apiDirectory, 'main.js')));
  assertNone(
    'Development-only packages are installed',
    installedDevOnlyPackages(path.join(apiDirectory, 'node_modules')),
  );
  loadNativeAddons(apiDirectory);
  assertNone('Commands missing from PATH', missingCommands(requiredCommands));
  assertNone(
    'Files missing',
    requiredFiles.filter((file) => !fs.existsSync(file)),
  );
  assertNone('Removed build output or tools are back', shippedLeftovers());
  for (const [variable, args] of [
    ['ESP_COREDUMP_CMD', ['--help']],
    ['ESP_COREDUMP_XTENSA_GDB', ['--version']],
    ['ESP_COREDUMP_RISCV_GDB', ['--version']],
  ]) {
    if (!process.env[variable]) throw new Error(`${variable} is not set`);
    execFileSync(process.env[variable], args, { stdio: ['ignore', 'ignore', 'inherit'] });
  }
  process.stdout.write('Server image verified.\n');
}

if (import.meta.main) {
  main();
}
