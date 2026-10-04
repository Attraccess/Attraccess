import { RuleTester } from 'eslint';

const rule = require('@nx/eslint-plugin').rules['workspace-multiline-import-specifiers'];

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parser: require('@typescript-eslint/parser') } });

tester.run('multiline-import-specifiers', rule, {
  valid: [
    "import { Button, DrawerHeading } from '@heroui/react';",
    "import { Button, DrawerHeading }\n  from '@heroui/react';",
    "import {\n  Button,\n  DrawerHeading,\n} from '@heroui/react';",
    "import React, {\n  type ReactNode,\n  useState as state,\n} from 'react';",
    "import type {\n  ButtonProps,\n  DrawerProps,\n} from '@heroui/react';",
    "import * as HeroUI from '@heroui/react';",
    "import '@heroui/styles';",
  ],
  invalid: [
    {
      code: "import {\n  DrawerHeader, DrawerHeading, ModalHeading,\n} from '@heroui/react';",
      output: "import {\n  DrawerHeader,\n  DrawerHeading,\n  ModalHeading,\n} from '@heroui/react';",
      errors: [{ messageId: 'onePerLine' }, { messageId: 'onePerLine' }],
    },
    {
      code: "import React, {\n  useState as state, type ReactNode,\n} from 'react';",
      output: "import React, {\n  useState as state,\n  type ReactNode,\n} from 'react';",
      errors: [{ messageId: 'onePerLine' }],
    },
    {
      code: "import {\n  Button, /* title */ DrawerHeading,\n} from '@heroui/react';",
      output: "import {\n  Button, /* title */\n  DrawerHeading,\n} from '@heroui/react';",
      errors: [{ messageId: 'onePerLine' }],
    },
    {
      code: "import { Button, DrawerHeading,\n  ModalHeading,\n} from '@heroui/react';",
      output: "import { Button,\n  DrawerHeading,\n  ModalHeading,\n} from '@heroui/react';",
      errors: [{ messageId: 'onePerLine' }],
    },
    {
      code: "import {\r\n  Button, DrawerHeading,\r\n} from '@heroui/react';",
      output: "import {\r\n  Button,\r\n  DrawerHeading,\r\n} from '@heroui/react';",
      errors: [{ messageId: 'onePerLine' }],
    },
  ],
});
