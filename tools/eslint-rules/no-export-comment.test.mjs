import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { RuleTester } from 'eslint';

const require = createRequire(import.meta.url);
const rule = require('./no-export-comment.cjs');

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parser: require('@typescript-eslint/parser'), parserOptions: { ecmaFeatures: { jsx: true } } },
});
tester.run('no-export-comment', rule, {
  valid: [
    '// note\nexport const a = 1;',
    'export const a = 1; // trailing',
    'export { a };',
    'export type { A };',
    'export type A = string;',
    "export default 'type';",
    "export * from './x';",
    'export {};\n// a comment on the next line',
    'const s = "export // not a comment";',
    'const el = <div>{/* export // c */}</div>;',
    'export default function f() {}',
  ],
  invalid: [
    { code: 'export // note\nconst a = 1;', errors: [{ messageId: 'exportComment' }] },
    { code: 'export /* note */ const a = 1;', errors: [{ messageId: 'exportComment' }] },
    { code: 'export // note\nfunction f() {}', errors: [{ messageId: 'exportComment' }] },
    { code: 'export default // note\nfunction f() {}', errors: [{ messageId: 'exportComment' }] },
    { code: 'export /* c */ { a };', errors: [{ messageId: 'exportComment' }] },
    { code: 'export // c\n{ a };', errors: [{ messageId: 'exportComment' }] },
    { code: "export /* c */ * from './x';", errors: [{ messageId: 'exportComment' }] },
    { code: "export // c\n* as ns from './x';", errors: [{ messageId: 'exportComment' }] },
    { code: 'export /* c */ = a;', errors: [{ messageId: 'exportComment' }] },
    { code: 'export /* c */ default function f() {}', errors: [{ messageId: 'exportComment' }] },
    { code: 'export type /* c */ { A };', errors: [{ messageId: 'exportComment' }] },
    { code: "export type // c\n* from './x';", errors: [{ messageId: 'exportComment' }] },
  ],
});
