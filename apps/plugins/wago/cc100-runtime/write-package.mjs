import { readFile, writeFile } from 'node:fs/promises';

const [outputDirectory, main] = process.argv.slice(2);
if (!outputDirectory || !['./main.cjs', './simulator.cjs'].includes(main)) {
  throw new Error('Usage: node write-package.mjs <output-directory> <main.cjs|simulator.cjs>');
}

const packageJson = JSON.parse(
  await readFile(new URL('./package.json', import.meta.url), 'utf8'),
);
packageJson.main = main;
packageJson.type = 'commonjs';
await writeFile(`${outputDirectory}/package.json`, JSON.stringify(packageJson, null, 2));
