// Runs as appuser in the runtime stage of the root Dockerfile and fails the image build when the slim image
// lacks something the server needs, or ships something that was removed on purpose.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

// The WAGO plugin spawns the OpenSSH tools; the monitoring-init compose service uses the shell tools.
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
];

const requiredFiles = ['/etc/ssl/certs/ca-certificates.crt', '/usr/share/zoneinfo/Europe/Berlin'];

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
  return requiredPackages(fs.readFileSync(entryFile, 'utf8')).filter((name) => {
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
  const Database = apiRequire('better-sqlite3');
  new Database(':memory:').close();
  // A transitive dependency of the mailer: only pnpm's hoisted directory reaches it.
  const hoisted = createRequire(path.join(apiDirectory, 'node_modules/.pnpm/node_modules/probe.js'));
  hoisted('@css-inline/css-inline').inline('<p>probe</p>');
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
  for (const [command, args] of [
    [process.env.ESP_COREDUMP_CMD, ['--help']],
    [process.env.ESP_COREDUMP_XTENSA_GDB, ['--version']],
    [process.env.ESP_COREDUMP_RISCV_GDB, ['--version']],
  ]) {
    execFileSync(command, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  }
  process.stdout.write('Server image verified.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
