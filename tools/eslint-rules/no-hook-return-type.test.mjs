import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { RuleTester } from 'eslint';

const require = createRequire(import.meta.url);
const rule = require('./no-hook-return-type.cjs');

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parser: require('@typescript-eslint/parser') } });
tester.run('no-hook-return-type', rule, {
  valid: [
    'type Props = { items: string[] };',
    'type R = ReturnType<typeof setTimeout>;',
    "type Q = UseQueryResult<Foo[]>;",
    'type Fn = ReturnType<typeof buildThing>;',
    'type B = typeof buildThing; type R = ReturnType<B>;',
    'type R = ReturnType<Handler>;',
    "type R = ReturnType<typeof import('./x').buildThing>;",
  ],
  invalid: [
    { code: 'type Props = ReturnType<typeof useThing>;', errors: [{ messageId: 'hookReturnType' }] },
    {
      code: "type Props = Pick<ReturnType<typeof usePluginState>, 'a' | 'b'>;",
      errors: [{ messageId: 'hookReturnType' }],
    },
    { code: "type T = ReturnType<typeof useTranslations>['t'];", errors: [{ messageId: 'hookReturnType' }] },
    { code: 'type Q = NonNullable<ReturnType<typeof ns.useThing>>;', errors: [{ messageId: 'hookReturnType' }] },
    { code: "type Q = Omit<ReturnType<typeof useThing>, 'a'>;", errors: [{ messageId: 'hookReturnType' }] },
    { code: 'type Q = Awaited<ReturnType<typeof useThing>>;', errors: [{ messageId: 'hookReturnType' }] },
    { code: "type Q = ReturnType<typeof import('./hooks').useThing>;", errors: [{ messageId: 'hookReturnType' }] },
    { code: 'type H = typeof useThing; type R = ReturnType<H>;', errors: [{ messageId: 'hookReturnType' }] },
    { code: 'type R = ReturnType<H>; type H = typeof useThing;', errors: [{ messageId: 'hookReturnType' }] },
    { code: 'function f(p: { a: ReturnType<typeof useThing> }) {}', errors: [{ messageId: 'hookReturnType' }] },
  ],
});
