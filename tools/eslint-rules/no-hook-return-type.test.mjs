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
  ],
  invalid: [
    { code: 'type Props = ReturnType<typeof useThing>;', errors: [{ messageId: 'hookReturnType' }] },
    {
      code: "type Props = Pick<ReturnType<typeof usePluginState>, 'a' | 'b'>;",
      errors: [{ messageId: 'hookReturnType' }],
    },
    { code: "type T = ReturnType<typeof useTranslations>['t'];", errors: [{ messageId: 'hookReturnType' }] },
    { code: 'type Q = NonNullable<ReturnType<typeof ns.useThing>>;', errors: [{ messageId: 'hookReturnType' }] },
  ],
});
