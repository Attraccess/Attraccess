/* eslint-disable no-console -- CLI diagnostics are intentional. */
// Paths that differ only by letter case are one file on case-insensitive file systems (macOS, Windows). Module
// specifiers resolve without an extension, so `./Foo` can also pick `foo.ts` when the folder holds `Foo.tsx`.
import { pathToFileURL } from 'node:url';
import { git } from './lib/repo-files.mjs';

const moduleExtension = /\.(?:[cm]?[jt]sx?|json)$/i;

/** Groups the given paths by the name a case-insensitive file system and an extensionless import see. */
export function caseCollisions(files) {
  const groups = new Map();
  const add = (key, name) => {
    const names = groups.get(key) ?? new Set();
    names.add(name);
    groups.set(key, names);
  };
  for (const file of files) {
    const parts = file.split('/');
    for (let depth = 1; depth < parts.length; depth++) {
      const directory = parts.slice(0, depth).join('/');
      add(`dir:${directory.toLowerCase()}`, `${directory}/`);
    }
    add(`file:${file.toLowerCase()}`, file);
    if (moduleExtension.test(file)) {
      const specifier = file.replace(moduleExtension, '');
      add(`module:${specifier.toLowerCase()}`, specifier);
    }
  }
  return [...groups.values()]
    .filter((names) => names.size > 1)
    .map((names) => [...names].sort())
    .sort(([a], [b]) => a.localeCompare(b));
}

function check() {
  let staged = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === '--staged') staged = true;
    else throw new Error('Usage: node scripts/check-case-collisions.mjs [--staged]');
  }
  process.chdir(git(['rev-parse', '--show-toplevel']).trim());
  // The index holds what is being committed; without --staged untracked files count too.
  const files = git(['ls-files', '--cached', ...(staged ? [] : ['--others', '--exclude-standard']), '-z'])
    .split('\0')
    .filter(Boolean);
  const collisions = caseCollisions([...new Set(files)]);
  for (const names of collisions) console.error(`Differ only by case: ${names.join(', ')}`);
  if (collisions.length) {
    console.error('Rename one of them: on macOS and Windows these are the same file or import.');
    process.exitCode = 1;
  } else {
    console.log(`Case collision check passed (${files.length} files).`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    check();
  } catch (error) {
    console.error(`Case collision check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
