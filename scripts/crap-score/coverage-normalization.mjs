import ts from 'typescript';

export function removeEnumWrappers(coverage, file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const enumRanges = [];
  const visit = (node) => {
    if (ts.isEnumDeclaration(node)) {
      const start = ast.getLineAndCharacterOfPosition(node.getStart(ast));
      const end = ast.getLineAndCharacterOfPosition(node.getEnd());
      const name = ast.getLineAndCharacterOfPosition(node.name.getStart(ast));
      enumRanges.push({
        start: start.line + 1,
        end: end.line + 1,
        startColumn: start.character,
        nameColumn: name.character,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  for (const [id, fn] of Object.entries(coverage.fnMap)) {
    if (
      !enumRanges.some(
        (range) =>
          fn.loc.start.line === range.start &&
          fn.loc.end.line === range.end &&
          fn.loc.start.column >= range.startColumn &&
          fn.loc.start.column <= range.nameColumn,
      )
    )
      continue;
    delete coverage.fnMap[id];
    delete coverage.f[id];
  }
}

// Re-export declarations have no source functions, even in files that also
// contain maintained functions. TypeScript's generated getters are scaffolding.
export function removeExportGetters(coverage, file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const ranges = ast.statements.filter(ts.isExportDeclaration).map((node) => ({
    start: node.getStart(ast),
    end: node.getEnd(),
  }));
  const position = (point) => ast.getPositionOfLineAndCharacter(point.line - 1, point.column ?? 0);
  for (const [id, fn] of Object.entries(coverage.fnMap)) {
    if (
      ranges.some(
        (range) =>
          position(fn.loc.start) >= range.start &&
          position(fn.loc.start) < range.end &&
          position(fn.loc.end) <= range.end,
      )
    ) {
      delete coverage.fnMap[id];
      delete coverage.f[id];
    }
  }
}

export function fillMissingFunctions(measured, original) {
  const locations = new Set(Object.values(measured.fnMap).map((fn) => JSON.stringify(fn.loc)));
  const statements = new Set(Object.values(measured.statementMap).map((statement) => JSON.stringify(statement)));
  const before = (a, b) => a.line < b.line || (a.line === b.line && a.column <= b.column);
  for (const [id, fn] of Object.entries(original.fnMap)) {
    if (locations.has(JSON.stringify(fn.loc))) continue;
    measured.fnMap[`source-${id}`] = fn;
    measured.f[`source-${id}`] = 0;
    for (const [statementId, statement] of Object.entries(original.statementMap)) {
      if (!before(fn.loc.start, statement.start) || !before(statement.end, fn.loc.end)) continue;
      if (statements.has(JSON.stringify(statement))) continue;
      const key = `source-${statementId}`;
      measured.statementMap[key] = statement;
      measured.s[key] = 0;
      statements.add(JSON.stringify(statement));
    }
  }
}

// Use complete source ranges, not names or just line numbers: anonymous
// callbacks and same-named methods can share a line and still be distinct.
export function deduplicateFunctions(file) {
  const locations = new Map();
  for (const [id, fn] of Object.entries(file.fnMap)) {
    const key = JSON.stringify([fn.loc.start.line, fn.loc.start.column, fn.loc.end.line, fn.loc.end.column]);
    const existing = locations.get(key);
    if (existing === undefined) {
      locations.set(key, id);
      continue;
    }
    // Duplicated mappings describe the same execution, not additional calls.
    file.f[existing] = Math.max(file.f[existing], file.f[id]);
    delete file.fnMap[id];
    delete file.f[id];
  }
}

// Runners can map the same statement with a concrete end column or an
// end-of-line sentinel. Repairing those ranges after merging must not leave a
// second, uncovered copy of a statement another runner already exercised.
export function deduplicateStatements(file) {
  const locations = new Map();
  for (const [id, statement] of Object.entries(file.statementMap)) {
    const key = JSON.stringify([
      statement.start.line,
      statement.start.column,
      statement.end.line,
      statement.end.column,
    ]);
    const existing = locations.get(key);
    if (existing === undefined) {
      locations.set(key, id);
      continue;
    }
    file.s[existing] = Math.max(file.s[existing], file.s[id]);
    delete file.statementMap[id];
    delete file.s[id];
  }
}
