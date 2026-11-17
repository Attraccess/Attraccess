/* eslint-disable no-console -- CLI diagnostics are intentional. */
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { excludedDirectory, generatedClients, git } from './lib/repo-files.mjs';

/**
 * ATT-1146: application, domain and transport code must not depend on the persistence implementation.
 *
 * Forbidden everywhere outside the allowed persistence code: `typeorm`, `@nestjs/typeorm`, the SQLite drivers and
 * `@attraccess/database-entities` (each with every subpath). Every import form counts: static imports, type-only
 * imports, re-exports, dynamic `import()`, `require()` and `import x = require()`.
 *
 * Adapter internals (apps/api/src/database/adapters, apps/api/src/database/sqlite, libs/database-entities) may only
 * be imported by Nest composition files (`*.module.ts`) and tests. The SDK's former engine subpath
 * (`@attraccess/plugins-backend-sdk/sqlite`) no longer exists and is flagged everywhere.
 *
 * Plugin zone (SDK 2.0: plugins have no database access): `apps/plugins/**`, `examples/**` and
 * `libs/plugins-backend-sdk/src/**` get no exemptions at all, tests and migrations included. Besides the packages
 * above they may not import `pg`, `mysql2`, `knex` or any subpath of `@attraccess/plugins-backend-sdk` (the package
 * root and its package.json are the whole public surface). Plugin data goes through `context.storage`.
 *
 * Existing violations are recorded per file in scripts/persistence-boundaries.baseline.json. The baseline can only
 * shrink: a file that is not listed, or has more violations than listed, fails the check; a file that has fewer
 * fails until the baseline is lowered (run with --update). Neutral libraries, the frontend and the SDK sources may
 * never be listed.
 *
 * Plugin-zone entries in the baseline are TRANSITIONAL: they are the plugin sources that still use the old
 * persistence surface while the bundled plugins are ported to the record port. The check reports how many remain.
 * Once the ports have landed, run `--update` (the plugin entries vanish) and use `--require-clean-plugins`, which
 * fails while any plugin-zone entry is left in the baseline or in the sources.
 */

export const forbiddenPackage =
  /^(?:typeorm|@nestjs\/typeorm|sqlite3|better-sqlite3|@attraccess\/database-entities)(?:\/.*)?$/;
// Removed in SDK 2.0; nothing resolves it any more.
const sdkEngineSubpath = /^@attraccess\/plugins-backend-sdk\/sqlite(?:\/.*)?$/;
// Plugin zone: no exemptions; a stricter package list and no SDK subpath (the package root is the public surface).
const pluginZone = /^(?:apps\/plugins\/|examples\/|libs\/plugins-backend-sdk\/src\/)/;
const pluginZonePackage =
  /^(?:typeorm|@nestjs\/typeorm|sqlite3|better-sqlite3|pg|mysql2|knex|@attraccess\/database-entities)(?:\/.*)?$/;
const sdkSubpath = /^@attraccess\/plugins-backend-sdk\/(?!package\.json$).+/;
const adapterInternals =
  /^apps\/api\/src\/database\/(?:adapters|sqlite)(?:\/|$)|(?:^|\/)libs\/database-entities(?:\/|$)/;

// Persistence implementation code that may use the ORM and the drivers. Only the engine folders of
// apps/api/src/database are listed: its neutral seam (unit-of-work.ts, persistence-errors.ts, transaction-context.ts,
// backend/database-backend.ts, ...) stays checked.
const allowedPaths = [
  /^libs\/database-entities\//,
  /^apps\/api\/src\/database\/(?:adapters|sqlite|conformance|migrations|migration-helpers)\//,
  // The backend registry: the one file that lists the engines and types the selected one for the composition root.
  /^apps\/api\/src\/database\/backend\/resolve-database-backend\.ts$/,
  // The import path released migration 1790100000000 uses for the engine's usage recovery (a re-export of sqlite/).
  /^apps\/api\/src\/database\/resource-usage-integrity\.ts$/,
  /(^|\/)migrations\//,
  // Real-engine tests: they open actual databases to prove migrations, constraints, transactions and concurrency.
  // Unit specs that only fake repositories stay checked.
  /\.(?:persistence|integration|e2e)\.spec\.ts$/,
  /^apps\/api\/src\/(?:e2e|test|__test__|test-utils)\//,
  /^apps\/plugins\/[^/]+\/acceptance\//,
];
// Code that may never carry a baseline entry.
const zeroTolerance = [
  /^libs\/application-models\//,
  /^apps\/frontend\//,
  /^libs\/(?:ui|shared|env|api-client)\//,
  /^libs\/plugins-backend-sdk\/src\//,
];

// Nest composition files wire adapters to ports; tests build adapters by hand.
const compositionFile = /\.module\.ts$/;
const testFile =
  /\.(?:spec|test)\.[cm]?tsx?$|\.test-(?:fixture|utils)\.ts$|(?:^|\/)(?:test|tests|__test__|test-utils|testing|e2e)\//;
const sourceFile = /^(apps|libs|examples)\/.*\.(?:[cm]?ts|tsx)$/;
const baselineFile = fileURLToPath(new URL('./persistence-boundaries.baseline.json', import.meta.url));

export const isPluginZone = (file) => pluginZone.test(file);

export function isChecked(file) {
  return (
    sourceFile.test(file) &&
    !file.endsWith('.d.ts') &&
    !excludedDirectory.test(file) &&
    !generatedClients.test(file) &&
    (isPluginZone(file) || !allowedPaths.some((pattern) => pattern.test(file)))
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
  const zone = isPluginZone(file);
  const mayWireAdapters = !zone && (compositionFile.test(file) || testFile.test(file));
  return specifiers.filter((specifier) => {
    if (forbiddenPackage.test(specifier) || sdkEngineSubpath.test(specifier)) return true;
    if (zone && (pluginZonePackage.test(specifier) || sdkSubpath.test(specifier))) return true;
    if (!specifier.startsWith('.') || mayWireAdapters) return false;
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
          `typeorm, drivers, @attraccess/database-entities or adapter internals; plugins use context.storage and ` +
          `import only the root of @attraccess/plugins-backend-sdk.`,
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

/** Plugin-zone files that are still on the baseline or still violate: the transitional debt of the plugin ports. */
export function pluginDebt(counts, baseline) {
  return [...new Set([...Object.keys(counts), ...Object.keys(baseline)])].filter(isPluginZone).sort();
}

function main() {
  const update = process.argv.includes('--update');
  const requireCleanPlugins = process.argv.includes('--require-clean-plugins');
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
  const debt = pluginDebt(counts, baseline);
  if (requireCleanPlugins && debt.length > 0) {
    problems.push(`${debt.length} plugin-zone file(s) still use the old persistence surface: ${debt.join(', ')}`);
  }
  if (problems.length > 0) {
    console.error(`Persistence boundary check failed:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Persistence boundaries hold: ${Object.keys(baseline).length} files remain on the shrinking baseline.`);
  if (debt.length > 0) {
    console.log(`  ${debt.length} of them are transitional plugin-zone files (ports to context.storage pending).`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
