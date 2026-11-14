#!/usr/bin/env node
/* eslint-disable no-console -- CLI diagnostics are intentional. */
// apps/cesentry is a private repository mounted as a git submodule (CONTRIBUTING.md, "Private submodule"). This
// repository may hold only the pointer to it: one gitlink entry, never files under the path. `update = none` keeps
// `git clone --recurse-submodules` and `git submodule update` from trying to fetch it for people without access.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUBMODULE_PATH = 'apps/cesentry';

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function gitmodulesValue(key, cwd) {
  try {
    return git(['config', '--file', '.gitmodules', '--get-all', `submodule.${SUBMODULE_PATH}.${key}`], cwd)
      .split('\n')
      .filter(Boolean);
  } catch {
    // `git config --get-all` exits 1 when the key (or the file) is missing.
    return [];
  }
}

/** Returns the problems found in the index and in .gitmodules (empty when the pointer is intact). */
export function checkPrivateSubmodule(cwd = process.cwd()) {
  const problems = [];
  const entries = git(['ls-files', '--stage', '-z', '--', SUBMODULE_PATH], cwd).split('\0').filter(Boolean);
  const gitlinks = entries.filter((entry) => entry.startsWith('160000 ') && entry.endsWith(`\t${SUBMODULE_PATH}`));
  if (entries.length !== 1 || gitlinks.length !== 1) {
    problems.push(
      `${SUBMODULE_PATH} must be exactly one submodule pointer (mode 160000); the index has ${entries.length} ` +
        `entr${entries.length === 1 ? 'y' : 'ies'} there:\n${entries.map((entry) => `  ${entry}`).join('\n')}`,
    );
  }
  const paths = gitmodulesValue('path', cwd);
  if (paths.length !== 1 || paths[0] !== SUBMODULE_PATH)
    problems.push(`.gitmodules must declare [submodule "${SUBMODULE_PATH}"] with path = ${SUBMODULE_PATH}.`);
  const updates = gitmodulesValue('update', cwd);
  if (updates.length !== 1 || updates[0] !== 'none')
    problems.push(`.gitmodules must keep update = none for ${SUBMODULE_PATH}, so clones without access skip it.`);
  const urls = gitmodulesValue('url', cwd);
  if (urls.length !== 1 || !urls[0].startsWith('https://'))
    problems.push(
      `.gitmodules must give ${SUBMODULE_PATH} one HTTPS url, so people with access clone it with their credentials.`,
    );
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkPrivateSubmodule();
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exitCode = 1;
  else console.log(`${SUBMODULE_PATH} is a submodule pointer with update = none.`);
}
