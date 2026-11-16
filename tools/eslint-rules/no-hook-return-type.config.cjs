/**
 * Config block that enables `@nx/workspace-no-hook-return-type` (ATT-1224) for the given file globs.
 *
 * Frontend props and helpers use explicit types, never a hook's ReturnType. Tests are excluded: their mocks
 * legitimately use ReturnType<typeof useXQuery>. Projects whose lint target runs ESLint from their own folder
 * (frontend, plugins-frontend-ui, plugins-frontend-sdk) match globs relative to that folder, so they add this block
 * with their own globs; the root config covers the targets that lint from the workspace root.
 */
module.exports = function noHookReturnTypeConfig(files) {
  return {
    files,
    ignores: ['**/*.{test,spec}.{ts,tsx}', '**/*.hoisted.*', '**/tests/**', '**/test-utils/**'],
    rules: {
      '@nx/workspace-no-hook-return-type': 'error',
    },
  };
};
