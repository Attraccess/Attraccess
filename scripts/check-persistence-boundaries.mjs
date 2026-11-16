/* eslint-disable no-console -- CLI diagnostics are intentional. */
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { excludedDirectory, generatedClients, git } from './lib/repo-files.mjs';

/**
 * ATT-1146: application, domain and transport code must not depend on the persistence implementation.
 *
 * Forbidden everywhere outside the allowed persistence code: `typeorm`, `@nestjs/typeorm`, the SQLite drivers,
 * `@attraccess/database-entities`, and relative imports of adapter internals (`database/sqlite`). Every import form
 * counts: static imports, type-only imports, re-exports, dynamic `import()`, `require()` and `import x = require()`.
 *
 * Existing violations are recorded per file in scripts/persistence-boundaries.baseline.json. The baseline can only
 * shrink: a file that is not listed, or has more violations than listed, fails the check; a file that has fewer
 * fails until the baseline is lowered (run with --update). Neutral libraries and the frontend may never be listed.
 */

export const forbiddenPackage =
  /^(?:typeorm(?:\/.*)?|@nestjs\/typeorm|sqlite3|better-sqlite3|@attraccess\/database-entities)$/;
const adapterInternals = /(?:^|\/)database\/sqlite(?:\/|$)|(?:^|\/)libs\/database-entities(?:\/|$)/;

// Persistence implementation code that may use the ORM and the drivers.
const allowedPaths = [/^libs\/database-entities\//, /^apps\/api\/src\/database\//, /(^|\/)migrations\//];
// Code that may never carry a baseline entry.
const zeroTolerance = [/^libs\/application-models\//, /^apps\/frontend\//, /^libs\/(?:ui|shared|env|api-client)\//];

const sourceFile = /^(apps|libs|examples)\/.*\.(?:[cm]?ts|tsx)$/;
const baselineFile = fileURLToPath(new URL('./persistence-boundaries.baseline.json', import.meta.url));

export function isChecked(file) {
  return (
    sourceFile.test(file) &&
    !file.endsWith('.d.ts') &&
    !excludedDirectory.test(file) &&
    !generatedClients.test(file) &&
    !allowedPaths.some((pattern) => pattern.test(file))
  );
}

function collectSpecifiers(node, specifiers) {
  if (ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier)) {
    if (ts.isStringLiteralLike(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
  } else if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    ts.isStringLiteralLike(node.moduleReference.expression)
  ) {
    specifiers.push(node.moduleReference.expression.text);
  } else if (
    ts.isCallExpression(node) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require') ||
      // jest.requireActual('typeorm') and friends load the module just the same
      (ts.isPropertyAccessExpression(node.expression) && /^require(?:Actual|Mock)$/.test(node.expression.name.text))) &&
    node.arguments.length >= 1 &&
    ts.isStringLiteralLike(node.arguments[0])
  ) {
    specifiers.push(node.arguments[0].text);
  } else if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteralLike(node.argument.literal)
  ) {
    // `typeof import('typeorm')` and `import('typeorm').Repository` in a type position
    specifiers.push(node.argument.literal.text);
  }
  ts.forEachChild(node, (child) => collectSpecifiers(child, specifiers));
}

/** The forbidden module specifiers a source file loads or references, one entry per occurrence. */
export function findViolations(file, content) {
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, false, kind);
  const specifiers = [];
  collectSpecifiers(source, specifiers);
  return specifiers.filter((specifier) => {
    if (forbiddenPackage.test(specifier)) return true;
    if (!specifier.startsWith('.')) return false;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    return adapterInternals.test(resolved);
  });
}

function listTrackedAndNewFiles() {
  return git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0');
}

function readIfFile(file) {
  try {
    return lstatSync(file).isFile() ? readFileSync(file, 'utf8') : undefined;
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

/** The checked sources of the working tree. The file listing and the reader are injectable for tests. */
export function workingTreeSources(listFiles = listTrackedAndNewFiles, readFile = readIfFile) {
  const result = new Map();
  for (const file of listFiles().filter(isChecked)) {
    const content = readFile(file);
    if (content !== undefined) result.set(file, content);
  }
  return result;
}

export function countViolations(sources) {
  const counts = {};
  for (const [file, content] of sources) {
    const found = findViolations(file, content);
    if (found.length > 0) counts[file] = found.length;
  }
  return counts;
}

/** Compares current counts with the baseline. Returns human readable problems; empty means the check passes. */
export function compareWithBaseline(counts, baseline) {
  const problems = [];
  for (const [file, count] of Object.entries(counts)) {
    if (zeroTolerance.some((pattern) => pattern.test(file))) {
      problems.push(`${file}: ${count} forbidden persistence import(s); this code must never depend on persistence`);
      continue;
    }
    const allowed = baseline[file] ?? 0;
    if (count > allowed) {
      problems.push(
        `${file}: ${count} forbidden persistence import(s), ${allowed} allowed. Use an application port instead of ` +
          `typeorm, drivers, @attraccess/database-entities or adapter internals.`,
      );
    }
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    const count = counts[file] ?? 0;
    if (count < allowed) {
      problems.push(`${file}: baseline allows ${allowed} but only ${count} remain; run with --update to lower it`);
    }
  }
  return problems;
}

function main() {
  const update = process.argv.includes('--update');
  const counts = countViolations(workingTreeSources());
  if (update) {
    const entries = Object.entries(counts).filter(([file]) => !zeroTolerance.some((pattern) => pattern.test(file)));
    const baseline = Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(baselineFile, JSON.stringify(baseline, null, 2) + '\n');
    console.log(`Wrote ${entries.length} files to the persistence boundary baseline.`);
    return;
  }
  const baseline = JSON.parse(readFileSync(baselineFile, 'utf8'));
  const problems = compareWithBaseline(counts, baseline);
  if (problems.length > 0) {
    console.error(`Persistence boundary check failed:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Persistence boundaries hold: ${Object.keys(baseline).length} files remain on the shrinking baseline.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
