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
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?js$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
      'no-warning-comments': 'off',
      'no-console': 'error',
    },
  },
  {
    files: ['**/*.tsx'],
    rules: {
      // ATT-294 / ATT-834: HeroUI identifies a form field purely by its fill, and
      // --field-background is the same value as --surface. A field inside a Card is
      // therefore its container's exact colour (measured 1.00:1) — invisible until
      // focus paints the ring. The rule has regressed twice; this is the guard.
      // Fields inside a modal/drawer are fine even under a Card, because the dialog
      // portals to <body> — but nesting one inside a Card is not a shape we use.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXElement[openingElement.name.name='Card'] JSXElement[openingElement.name.name=/^(TextField|NumberField|SearchField|Select|ComboBox|Textarea|TextArea|DateField|TimeField|DatePicker)$/]",
          message:
            'Form fields must not sit inside a Card: HeroUI gives fields no border and a fill equal to --surface, so they render invisible on a Card. Use a plain <section> with a <header> instead (see ATT-834).',
        },
      ],
    },
  },
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
