// Single source of truth for the Nx projects CI skips when it runs lint,
// typecheck or build. Every workflow reads it instead of hard-coding a list:
//
//   pnpm nx run-many -t build --exclude="$(node scripts/ci-nx-exclude.mjs build)"
//
// Dependency-free on purpose, so it can run before `pnpm install`.
import { pathToFileURL } from 'node:url';

export const TARGETS = ['lint', 'typecheck', 'build'];

// Excluded for every target.
const ALL_TARGETS = [
  // Needs ESP-IDF or macOS, which the CI runners for these jobs do not have.
  'tag:scope:hardware',
];

// Excluded for `build` only: these still get linted and typechecked.
const BUILD_ONLY = [
  // electron-builder packages for the host platform; `build-companion` already builds it.
  'tag:scope:companion',
  // Built and packed by the `plugins` job.
  'tag:type:plugin',
];

export function excludesFor(target) {
  if (!TARGETS.includes(target)) throw new Error(`Unknown target "${target}"; expected one of ${TARGETS.join(', ')}`);
  return [...ALL_TARGETS, ...(target === 'build' ? BUILD_ONLY : [])].join(',');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    console.log(excludesFor(process.argv[2]));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
