import { ESLint } from 'eslint';

const eslint = new ESLint();
const results = await eslint.lintFiles(['apps/plugins/wago/**/*.{ts,tsx,js,jsx,cjs,mjs}']);
const violations = results.flatMap(({ filePath, messages }) =>
  messages
    .filter(({ ruleId }) => ruleId === '@nx/enforce-module-boundaries')
    .map(({ line, column, message }) => `${filePath}:${line}:${column} ${message}`),
);

if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Module boundaries passed for ${results.length} Wago files.`);
}
