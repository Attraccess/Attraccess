const nx = require('@nx/eslint-plugin');
const noHookReturnTypeConfig = require('./tools/eslint-rules/no-hook-return-type.config.cjs');

// Plugins have no database access (ATT-1146): no database engine, ORM, host entity or SDK subpath in plugin code,
// examples and the SDK itself. The list is shared with the host's bundle check, scripts/check-persistence-boundaries.mjs
// (which also catches dynamic import() and require()) and the packaging check; this rule gives editor feedback on
// static imports. Plugin tests may open an engine (to compare a declared schema with a 1.x one). A flat-config rule
// entry replaces an earlier one for the same files, so blocks that set `no-restricted-imports` for plugin code spread
// these.
const forbiddenPluginModules = require('./apps/api/src/plugin-system/runtime/forbidden-plugin-modules.json');
const PLUGIN_STORAGE_BOUNDARY_MESSAGE =
  'Plugins have no database access: keep data in declared tables through context.storage (see docs/en/plugins/plugin-storage.md). Only the package root of @attraccess/plugins-backend-sdk is public.';
/** `no-restricted-imports` options forbidding `modules` (an entry ending in /* forbids its whole scope). */
const restrictedModules = (modules) => ({
  paths: modules
    .filter((name) => !name.endsWith('/*'))
    .map((name) => ({ name, message: PLUGIN_STORAGE_BOUNDARY_MESSAGE })),
  patterns: [
    {
      group: [
        ...modules.map((name) => (name.endsWith('/*') ? `${name.slice(0, -2)}/**` : `${name}/**`)),
        '@attraccess/plugins-backend-sdk/**',
        '!@attraccess/plugins-backend-sdk/package.json',
      ],
      message: PLUGIN_STORAGE_BOUNDARY_MESSAGE,
    },
  ],
});
const pluginStorageBoundary = restrictedModules([
  ...forbiddenPluginModules.engines,
  ...forbiddenPluginModules.frameworks,
  ...forbiddenPluginModules.host,
]);
const pluginTestStorageBoundary = restrictedModules([
  ...forbiddenPluginModules.frameworks,
  ...forbiddenPluginModules.host,
]);
/**
 * The ORMs and host modules as module-boundary globs (each package with its subpaths, or a whole scope). The engines
 * are left to `no-restricted-imports`, which lets plugin tests open one; the boundary rule cannot tell tests apart.
 */
const PERSISTENCE_PACKAGE_GLOBS = [...forbiddenPluginModules.frameworks, ...forbiddenPluginModules.host].flatMap(
  (name) => (name.endsWith('/*') ? [name, `${name}*`] : [name, `${name}/**`]),
);
/** The boundary for `files`; `testFiles` (their specs and test fixtures) may also import a database engine. */
const pluginStorageBoundaryConfig = (files, testFiles = []) => [
  { files, rules: { 'no-restricted-imports': ['error', pluginStorageBoundary] } },
  ...(testFiles.length > 0
    ? [{ files: testFiles, rules: { 'no-restricted-imports': ['error', pluginTestStorageBoundary] } }]
    : []),
];
const pluginTestFiles = (root) => [
  `${root}/**/*.{spec,test}.{ts,tsx,js,mjs,cjs}`,
  `${root}/**/*.{test-fixture,test-utils}.ts`,
];

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
      '@nx/workspace-multiline-import-specifiers': 'error',
      '@nx/workspace-no-export-comment': 'error',
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?js$', '^(\\.\\./)+tools/vite/'],
          depConstraints: [
            // Plugins are encapsulated, separately shipped products. They may build
            // only on the public plugin SDKs — never on core apps, core libs, or
            // other plugins.
            {
              sourceTag: 'type:plugin',
              onlyDependOnLibsWithTags: ['scope:plugin-sdk'],
              bannedExternalImports: PERSISTENCE_PACKAGE_GLOBS,
            },
            // The plugin SDK is neutral: it never builds on the persistence libraries (database-entities) or names
            // an ORM or driver. The host implements the record port; the SDK only declares it.
            {
              sourceTag: 'scope:plugin-sdk',
              notDependOnLibsWithTags: ['scope:persistence'],
              bannedExternalImports: PERSISTENCE_PACKAGE_GLOBS,
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
  // ATT-1224: no hook ReturnType in frontend source. For lint targets that run from the workspace root (plugins,
  // companion); frontend and the plugin UI libs lint from their own folder and add the block themselves.
  noHookReturnTypeConfig([
    'apps/frontend/**/*.{ts,tsx}',
    'apps/plugins/*/frontend/**/*.{ts,tsx}',
    'libs/plugins-frontend-*/**/*.{ts,tsx}',
    'apps/companion/renderer/**/*.{ts,tsx}',
  ]),
  // Plugin code, plugin tests and the examples (the SDK lints from its own folder and adds the block itself).
  ...pluginStorageBoundaryConfig(
    ['apps/plugins/**/*.{ts,tsx,js,mjs,cjs}', 'examples/**/*.{ts,tsx,js,mjs,cjs}'],
    [...pluginTestFiles('apps/plugins'), ...pluginTestFiles('examples')],
  ),
  {
    // ATT-1224: plugin dialogs use the shared StandardModal / StatusDialog.
    files: ['apps/plugins/*/frontend/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: pluginStorageBoundary.patterns,
          paths: [
            ...pluginStorageBoundary.paths,
            {
              name: '@heroui/react',
              importNames: ['Modal', 'ModalBackdrop', 'ModalContainer', 'ModalDialog'],
              message:
                'Use StandardModal or StatusDialog from @attraccess/plugins-frontend-ui instead of the raw HeroUI Modal.',
            },
          ],
        },
      ],
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

// Shared with project configs that lint from their own folder (see no-hook-return-type.config.cjs).
module.exports.noHookReturnTypeConfig = noHookReturnTypeConfig;
module.exports.pluginStorageBoundaryConfig = pluginStorageBoundaryConfig;
