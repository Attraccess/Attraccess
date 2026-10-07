import istanbulCoverage from 'istanbul-lib-coverage';
const { createCoverageMap } = istanbulCoverage;
import { createInstrumenter } from 'istanbul-lib-instrument';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repairFunctionLocations, repairStatementLocations } from './coverage-locations.mjs';
import {
  deduplicateFunctions,
  deduplicateStatements,
  fillMissingFunctions,
  removeEnumWrappers,
  removeExportGetters,
} from './coverage-normalization.mjs';
import { workspace } from './project-sources.mjs';

export function completeCoverage(files, reports) {
  const coverage = createCoverageMap({});
  for (const report of reports) coverage.merge(report);
  const wanted = new Set(files.map((file) => path.resolve(workspace, file)));
  coverage.filter((file) => wanted.has(file));
  for (const file of wanted) {
    const instrumenter = createInstrumenter({
      // JSX is only enabled on JSX files: otherwise TS generic arrow functions are ambiguous.
      parserPlugins: ['typescript', 'decorators-legacy', ...(/\.[jt]sx$/.test(file) ? ['jsx'] : [])],
    });
    const source = readFileSync(file, 'utf8');
    instrumenter.instrumentSync(source, file);
    const original = instrumenter.lastFileCoverage();
    if (!coverage.files().includes(file)) {
      coverage.addFileCoverage(original);
    } else {
      // TypeScript emits export getters for barrels with no source functions.
      // They are compiler scaffolding, not first-party function declarations.
      if (Object.keys(original.fnMap).length === 0) {
        coverage.fileCoverageFor(file).data.fnMap = {};
        coverage.fileCoverageFor(file).data.f = {};
      }
      removeEnumWrappers(coverage.fileCoverageFor(file), file, source);
      removeExportGetters(coverage.fileCoverageFor(file), file, source);
      repairFunctionLocations(coverage.fileCoverageFor(file).fnMap, original.fnMap);
      repairStatementLocations(coverage.fileCoverageFor(file).statementMap, original.statementMap);
      fillMissingFunctions(coverage.fileCoverageFor(file), original);
    }
    deduplicateStatements(coverage.fileCoverageFor(file));
    deduplicateFunctions(coverage.fileCoverageFor(file));
  }
  const result = coverage.toJSON();
  // Upstream indexes functions by name. Repeated methods/anonymous names must not overwrite each other.
  for (const file of Object.values(result)) {
    for (const [id, fn] of Object.entries(file.fnMap)) fn.name = `${fn.name}:${fn.loc.start.line}:${id}`;
  }
  return result;
}
