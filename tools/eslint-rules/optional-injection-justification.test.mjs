import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { RuleTester } from 'eslint';

const require = createRequire(import.meta.url);
const rule = require('./optional-injection-justification.cjs');

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parser: require('@typescript-eslint/parser') } });

tester.run('optional-injection-justification', rule, {
  valid: [
    'class A { constructor(private readonly a: A) {} }',
    'class A {\n  constructor(\n    // optional: Valkey is an optional deployment component\n    @Optional() private readonly a?: A,\n  ) {}\n}',
    'class A {\n  constructor(\n    @Optional() private readonly a?: A, // optional: falls back to defaults\n  ) {}\n}',
    'class A {\n  constructor(\n    // optional: extension point with a safe default\n    @Optional()\n    @Inject(TOKEN)\n    private readonly a?: A,\n  ) {}\n}',
    'class A {\n  // optional: only a preference\n  @Optional() private a?: A;\n}',
  ],
  invalid: [
    {
      code: 'class A {\n  constructor(\n    @Optional() private readonly a?: A,\n  ) {}\n}',
      errors: [{ messageId: 'missingJustification' }],
    },
    {
      code: 'class A {\n  constructor(\n    // optional:\n    @Optional() private readonly a?: A,\n  ) {}\n}',
      errors: [{ messageId: 'missingJustification' }],
    },
    {
      code: 'class A {\n  constructor(\n    // optional: stale comment\n\n    @Optional() private readonly a?: A,\n  ) {}\n}',
      errors: [{ messageId: 'missingJustification' }],
    },
    {
      code: 'class A {\n  constructor(\n    // just a comment\n    @Optional() private readonly a?: A,\n  ) {}\n}',
      errors: [{ messageId: 'missingJustification' }],
    },
  ],
});
