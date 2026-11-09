// Single source of truth for the Nx projects CI skips when it runs lint,
// typecheck or build. Every workflow reads it instead of hard-coding a list:
//
//   exclude="$(node scripts/ci-nx-exclude.mjs build)"
//   pnpm nx run-many -t build --exclude="$exclude"
//
// Assign first: bash -e ignores a failing $(...) inside an argument, so an
// inline call would run Nx with nothing excluded.
// Dependency-free on purpose, so it can run before `pnpm install`.

export const TARGETS = ['lint', 'typecheck', 'build'];

// Excluded for every target.
const ALL_TARGETS = [
  // Needs ESP-IDF or macOS, which the CI runners for these jobs do not have.
  'tag:scope:hardware',
];

// Excluded for `build` only: these still get linted and typechecked.
const BUILD_ONLY = [
  // electron-builder packages for the host platform; the `build-companion` job
  // builds it in the workflows that ship it.
  'tag:scope:companion',
  // Built and packed by the `plugins` job; not part of `nx release`.
  'tag:type:plugin',
];

export function excludesFor(target) {
  if (!TARGETS.includes(target)) throw new Error(`Unknown target "${target}"; expected one of ${TARGETS.join(', ')}`);
  return [...ALL_TARGETS, ...(target === 'build' ? BUILD_ONLY : [])].join(',');
}

if (import.meta.main) {
  try {
    console.log(excludesFor(process.argv[2]));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
