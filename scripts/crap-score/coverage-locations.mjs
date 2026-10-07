// Source-map remapping may leave end columns null (end of line). Restore exact
// boundaries from the original source, without changing any execution counts.
export function repairFunctionLocations(measured, original) {
  const before = (a, b) => a.line < b.line || (a.line === b.line && a.column <= b.column);
  const contains = (outer, inner) => before(outer.start, inner.start) && before(inner.end, outer.end);
  for (const fn of Object.values(measured)) {
    const originals = Object.values(original);
    const exactDeclaration = originals.filter(
      (candidate) => JSON.stringify(candidate.decl.start) === JSON.stringify(fn.decl.start),
    );
    if (exactDeclaration.length === 1) {
      fn.loc = exactDeclaration[0].loc;
      fn.decl = exactDeclaration[0].decl;
      continue;
    }
    const namedDeclaration = originals.filter(
      (candidate) => candidate.name === fn.name && candidate.decl.start.line === fn.decl.start.line,
    );
    if (!fn.name.startsWith('(anonymous') && namedDeclaration.length === 1) {
      fn.loc = namedDeclaration[0].loc;
      fn.decl = namedDeclaration[0].decl;
      continue;
    }
    const fullRange = (candidate) => ({ start: candidate.decl.start, end: candidate.loc.end });
    const inside = (point, range) => point.column != null && before(range.start, point) && before(point, range.end);
    const overlaps = originals.filter(
      (candidate) => inside(fn.loc.start, fullRange(candidate)) || inside(fn.loc.end, fullRange(candidate)),
    );
    const innermost = overlaps.filter(
      (candidate) => !overlaps.some((other) => other !== candidate && contains(fullRange(candidate), fullRange(other))),
    );
    if (innermost.length === 1) {
      fn.loc = innermost[0].loc;
      fn.decl = innermost[0].decl;
      continue;
    }
    if (fn.loc.end.column != null) continue;
    let matches = originals.filter(
      (candidate) =>
        candidate.loc.start.line === fn.loc.start.line && candidate.loc.start.column === fn.loc.start.column,
    );
    if (matches.length !== 1) {
      const range = { start: fn.loc.start, end: { ...fn.loc.end, column: Infinity } };
      const contained = originals.filter((candidate) => contains(range, candidate.loc));
      matches = contained.filter(
        (candidate) => !contained.some((other) => other !== candidate && contains(other.loc, candidate.loc)),
      );
    }
    if (matches.length !== 1) throw new Error(`Ambiguous source mapping for ${fn.name}`);
    fn.loc = matches[0].loc;
    fn.decl = matches[0].decl;
  }
}

export function repairStatementLocations(measured, original) {
  for (const [id, statement] of Object.entries(measured)) {
    if (statement.end.column != null) continue;
    const matches = Object.values(original).filter(
      (candidate) =>
        candidate.start.line === statement.start.line &&
        candidate.start.column === statement.start.column &&
        candidate.end.line === statement.end.line,
    );
    if (matches.length > 1)
      throw new Error(`Ambiguous statement source mapping at ${statement.start.line}:${statement.start.column}`);
    if (matches.length === 1) measured[id] = matches[0];
  }
}
