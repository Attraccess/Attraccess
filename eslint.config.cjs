const nx = require('@nx/eslint-plugin');

module.exports = [
  // {
  //   files: ['**/*.json'],
  //   // Override or add rules here
  //   rules: {},
  //   languageOptions: {
  //     parser: require('jsonc-eslint-parser'),
  //   },
  // },

  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/tsconfig.**',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      '**/managed_components',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'],
    // Override or add rules here
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [
            '^.*/eslint(\\.base)?\\.config\\.[cm]?js$',
          ],
          depConstraints: [
            // Plugins are encapsulated, separately shipped products. They may build
            // only on the public plugin SDKs — never on core apps, core libs, or
            // other plugins.
            {
              sourceTag: 'type:plugin',
              onlyDependOnLibsWithTags: ['scope:plugin-sdk'],
            },
            // The core application must never know any concrete plugin: no core
            // project may depend on anything tagged type:plugin.
            {
              sourceTag: 'scope:core',
              notDependOnLibsWithTags: ['type:plugin'],
            },
            {
              sourceTag: 'scope:hardware',
              notDependOnLibsWithTags: ['type:plugin'],
            },
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
      'no-warning-comments': 'off',
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Plugin acceptance tests are the one place where host and plugin are composed
    // inside a single process: they boot real core services around a real plugin
    // build to prove end-to-end behavior (see apps/plugins/*/acceptance). They
    // are test-only and never part of a shipped plugin bundle, so module
    // boundaries are relaxed here — and only here. Shipped plugin code
    // (backend/, frontend/, shared contracts) stays fully isolated.
    files: ['apps/plugins/*/acceptance/**/*.ts'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  // ATT-294 / ATT-834: the "no form fields inside a Card" guard is not an ESLint rule.
  // Every regression so far put the Card and the field in different files, which a
  // per-file rule cannot see, and nx's flat/react config declares no-restricted-syntax
  // itself — a later flat entry replaces the earlier one, so a rule declared here would
  // be discarded in every React project. See tools/generators/src/no-fields-in-cards.spec.ts.

  // Add special configuration for CI environment that converts warnings to errors
  ...(process.env.CI === 'true'
    ? [
        {
          files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'],
          rules: {},
        },
      ]
    : []),
];
