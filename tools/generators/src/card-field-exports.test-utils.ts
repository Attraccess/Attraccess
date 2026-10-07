import * as path from 'path';
import { definesLocally, findLocalDeclaration } from './card-field-declarations.test-utils';
import { Import, localImports, Node, parse, resolveModule, ts } from './card-field-source.test-utils';

/** A component export, pinned to the module that declares it. */
export interface Export {
  file: string;
  name: string;
}

/**
 * The set of module files that provide the export `name` from `file`, following re-export
 * barrels (`export * from` / `export { x } from`). Resolution is name-aware: a barrel that
 * re-exports both fields and non-fields (e.g. `@attraccess/plugins-frontend-ui`) must resolve
 * the specific name, or every consumer of that barrel would read as a field.
 */
export function resolveExport(file: string, name: string, seen = new Set<string>()): Export[] {
  const key = `${file}#${name}`;
  if (seen.has(key)) return [];
  seen.add(key);
  const source = parse(file);
  const fromDir = path.dirname(file);
  const imports = localImports(source);
  const results: Export[] = [];

  for (const statement of source.statements as Node[]) {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) continue;
    const specifier = (statement.moduleSpecifier as Node).text as string;
    const target = resolveModule(fromDir, specifier);
    if (!target) continue;

    const clause = statement.exportClause as Node | undefined;
    if (!clause) {
      // `export * from './X'` — name passes through unchanged; the leaf must define it.
      results.push(...resolveExport(target, name, seen));
    } else if (ts.isNamedExports(clause)) {
      for (const element of clause.elements as Node[]) {
        if ((element.name as Node).text !== name) continue;
        const sourceName = element.propertyName ? ((element.propertyName as Node).text as string) : name;
        results.push(...resolveExport(target, sourceName, seen));
      }
    }
    // `export * as ns from './X'` does not re-export `name` directly; skip.
  }

  // `import X from './x'; export default X;` is the default-export counterpart
  // to the locally imported named re-export handled below.
  if (name === 'default') {
    for (const statement of source.statements as Node[]) {
      if (!ts.isExportAssignment(statement) || statement.isExportEquals || !ts.isIdentifier(statement.expression))
        continue;
      const imported = imports.get((statement.expression as Node).text as string);
      if (imported) results.push(...resolveExport(imported.file, imported.name, seen));
    }
  }

  // `import { X } from './x'; export { X };` is a re-export just like
  // `export { X } from './x'`, despite its export declaration lacking a module specifier.
  for (const statement of source.statements as Node[]) {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.moduleSpecifier ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      continue;
    }
    for (const element of (statement.exportClause as Node).elements as Node[]) {
      if ((element.name as Node).text !== name) continue;
      const localName = element.propertyName ? ((element.propertyName as Node).text as string) : name;
      const imported = imports.get(localName);
      if (imported) results.push(...resolveExport(imported.file, imported.name, seen));
      else if (findLocalDeclaration(source, localName)) results.push({ file, name });
    }
  }

  if (definesLocally(source, name)) results.push({ file, name });
  return results;
}

/**
 * Where `<Tag>` used in `file` is declared: the leaf modules behind a local import, or `file`
 * itself when the component sits beside its user.
 *
 * One resolver for both the Card entry point and the recursive walk. They were written
 * separately and drifted twice — each time leaving one side blind to a shape the other
 * handled (a same-file component under a Card; an imported component behind `memo`).
 */
export function resolveComponent(file: string, source: Node, imports: Map<string, Import>, name: string): Export[] {
  const imported = imports.get(name);
  if (imported) return resolveExport(imported.file, imported.name);
  return findLocalDeclaration(source, name) ? [{ file, name }] : [];
}
