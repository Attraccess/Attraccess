import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { RuleTester } from 'eslint';

const require = createRequire(import.meta.url);
const rule = require('./optional-injection-justification.cjs');

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parser: require('@typescript-eslint/parser') } });
const error = [{ messageId: 'missingJustification' }];

tester.run('optional-injection-justification', rule, {
  valid: [
    'class A { constructor(private readonly a: A) {} }',
    'class A { constructor(@Inject(TOKEN) private readonly a: A) {} }',
    'class A {\n  constructor(\n    // optional: Valkey is an optional deployment component\n    @Optional() private readonly a?: A,\n  ) {}\n}',
    'class A {\n  constructor(\n    @Optional() private readonly a?: A, // optional: falls back to defaults\n  ) {}\n}',
    'class A {\n  constructor(\n    // optional: extension point with a safe default\n    @Optional()\n    @Inject(TOKEN)\n    private readonly a?: A,\n  ) {}\n}',
    // The comment sits above the parameter's first decorator.
    'class A {\n  constructor(\n    // optional: extension point with a safe default\n    @Inject(TOKEN)\n    @Optional()\n    private readonly a?: A,\n  ) {}\n}',
    // The marker may start a comment block that continues on the next lines.
    'class A {\n  constructor(\n    // optional: only a preference;\n    // falls back to settings\n    @Optional() private readonly a?: A,\n  ) {}\n}',
    'class A {\n  constructor(\n    /* optional: only a preference */\n    @Optional() private readonly a?: A,\n  ) {}\n}',
    'class A {\n  // optional: only a preference\n  @Optional() private a?: A;\n}',
    'class A {\n  constructor(\n    /**\n     * The provisioning hook.\n     * optional: extension point with a safe default\n     */\n    @Optional() private readonly a?: A,\n  ) {}\n}',
  ],
  invalid: [
    {
      code: 'class A {\n  constructor(\n    /* optional:\n     * reason on the next line */\n    @Optional() private readonly a?: A,\n  ) {}\n}',
      errors: error,
    },
    { code: 'class A {\n  constructor(\n    @Optional() private readonly a?: A,\n  ) {}\n}', errors: error },
    {
      code: 'class A {\n  constructor(\n    // optional:\n    @Optional() private readonly a?: A,\n  ) {}\n}',
      errors: error,
    },
    {
      code: 'class A {\n  constructor(\n    // optional:   \n    @Optional() private readonly a?: A,\n  ) {}\n}',
      errors: error,
    },
    {
      code: 'class A {\n  constructor(\n    // optional: stale comment\n\n    @Optional() private readonly a?: A,\n  ) {}\n}',
      errors: error,
    },
    {
      code: 'class A {\n  constructor(\n    // just a comment\n    @Optional() private readonly a?: A,\n  ) {}\n}',
      errors: error,
    },
    {
      code: 'class A {\n  constructor(\n    // non-optional: must be required\n    @Optional() private readonly a?: A,\n  ) {}\n}',
      errors: error,
    },
    // The previous parameter's trailing comment does not justify the next @Optional().
    {
      code: 'class A {\n  constructor(\n    @Optional() private readonly a?: A, // optional: reason for a\n    @Optional() private readonly b?: B,\n  ) {}\n}',
      errors: error,
    },
    {
      code: "import { Optional as Opt } from '@nestjs/common';\nclass A {\n  constructor(\n    @Opt() private readonly a?: A,\n  ) {}\n}",
      errors: error,
    },
    {
      code: 'class A {\n  constructor(\n    @common.Optional() private readonly a?: A,\n  ) {}\n}',
      errors: error,
    },
  ],
});
