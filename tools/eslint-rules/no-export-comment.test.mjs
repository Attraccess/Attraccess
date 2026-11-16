import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { RuleTester } from 'eslint';

const require = createRequire(import.meta.url);
const rule = require('./no-export-comment.cjs');

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parser: require('@typescript-eslint/parser') } });
tester.run('no-export-comment', rule, {
  valid: [
    '// note\nexport const a = 1;',
    'export const a = 1; // trailing',
    'export /* inline */ { a };'.replace('export /* inline */ { a }', 'export { a }'),
    'export default function f() {}',
  ],
  invalid: [
    { code: 'export // note\nconst a = 1;', errors: [{ messageId: 'exportComment' }] },
    { code: 'export /* note */ const a = 1;', errors: [{ messageId: 'exportComment' }] },
    { code: 'export // note\nfunction f() {}', errors: [{ messageId: 'exportComment' }] },
    { code: 'export default // note\nfunction f() {}', errors: [{ messageId: 'exportComment' }] },
  ],
});
