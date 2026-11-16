const baseConfig = require('../../eslint.config.cjs');

module.exports = [
  ...baseConfig,
  // ATT-1222: security and audit collaborators must be required; every remaining
  // @Optional() in the auth code needs an `// optional: <reason>` comment.
  // Globs are relative to this file: `nx lint api` runs eslint from apps/api.
  {
    files: ['src/users-and-auth/**/*.ts', 'src/common/security/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.test.ts', '**/*test-fixture*', '**/*.test-utils.ts'],
    rules: {
      '@nx/workspace-optional-injection-justification': 'error',
    },
  },
  // ATT-1213: services and controllers compose collaborators; no abstract layers or provider inheritance.
  {
    files: ['src/**/*.ts'],
    ignores: [
      '**/*.spec.ts',
      '**/*.test.ts',
      '**/*test-fixture*',
      '**/*.fixture.ts',
      '**/*.test-utils.ts',
      'src/test-utils/**',
      '**/testing/**',
    ],
    rules: {
      '@nx/workspace-no-service-inheritance': 'error',
    },
  },
];
