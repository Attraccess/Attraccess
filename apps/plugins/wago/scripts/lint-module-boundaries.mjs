import { ESLint } from 'eslint';

const eslint = new ESLint();
const results = await eslint.lintFiles(['apps/plugins/wago/**/*.{ts,tsx,js,jsx,cjs,mjs}']);
const violations = results.flatMap(({ filePath, messages }) =>
  messages
    .filter(({ ruleId }) => ruleId === '@nx/enforce-module-boundaries')
    .map(({ line, column, message }) => `${filePath}:${line}:${column} ${message}`),
);

// Keep the isolation rule from silently disappearing when current sources happen
// not to cross a boundary. Exercise both a top-level plugin source and the nested
// CC100 runtime against core and sibling-plugin relative imports.
const boundaryProbes = [
  {
    filePath: 'apps/plugins/wago/backend/__module-boundary-probe__.ts',
    source: "import { AppModule } from '../../../api/src/app.module';\nvoid AppModule;\n",
  },
  {
    filePath: 'apps/plugins/wago/backend/__module-boundary-probe__.ts',
    source: "import { Plugin } from '../../shelly/backend/plugin';\nvoid Plugin;\n",
  },
  {
    filePath: 'apps/plugins/wago/cc100-runtime/src/__module-boundary-probe__.ts',
    source: "import { AppModule } from '../../../../api/src/app.module';\nvoid AppModule;\n",
  },
  {
    filePath: 'apps/plugins/wago/cc100-runtime/src/__module-boundary-probe__.ts',
    source: "import { Plugin } from '../../../shelly/backend/plugin';\nvoid Plugin;\n",
  },
];
for (const { filePath, source } of boundaryProbes) {
  const [result] = await eslint.lintText(source, { filePath });
  if (!result.messages.some(({ ruleId }) => ruleId === '@nx/enforce-module-boundaries')) {
    violations.push(`${filePath}: boundary probe was not rejected by @nx/enforce-module-boundaries`);
  }
}

if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Module boundaries passed for ${results.length} Wago files and ${boundaryProbes.length} negative probes.`);
}
