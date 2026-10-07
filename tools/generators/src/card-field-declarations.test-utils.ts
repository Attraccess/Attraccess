import { Node, ts } from './card-field-source.test-utils';

/** `export function Name` / `export class Name` / `export const Name` carry this modifier. */
export function hasExportModifier(node: Node): boolean {
  const modifiers = node.modifiers as Node[] | undefined;
  return !!modifiers && modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/** The top-level declaration of `name` in `source`, exported or not. */
export function findLocalDeclaration(source: Node, name: string): Node | null {
  for (const statement of source.statements as Node[]) {
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name && (statement.name as Node).text === name) return statement;
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of (statement.declarationList as Node).declarations as Node[]) {
        if (ts.isIdentifier(decl.name) && (decl.name as Node).text === name) return decl;
      }
    }
  }
  return null;
}

/**
 * The declaration `name` refers to in `source`, resolving `export { Local as Name }` back to
 * `Local`. Used to scope the field walk to one component rather than the whole module.
 */
export function declarationOf(source: Node, name: string): Node | null {
  const direct = findLocalDeclaration(source, name);
  if (direct) return direct;
  for (const statement of source.statements as Node[]) {
    if (name === 'default' && ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const expression = statement.expression as Node;
      return ts.isIdentifier(expression) ? findLocalDeclaration(source, expression.text as string) : expression;
    }
    if (
      name === 'default' &&
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      (statement.modifiers as Node[] | undefined)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      return statement;
    }
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
      const decl = findLocalDeclaration(source, localName);
      if (decl) return decl;
    }
  }
  return null;
}

/** Does `source` declare `name` as a local export, as opposed to re-exporting it? */
export function definesLocally(source: Node, name: string): boolean {
  for (const statement of source.statements as Node[]) {
    if (
      name === 'default' &&
      ((ts.isExportAssignment(statement) && !statement.isExportEquals) ||
        ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
          (statement.modifiers as Node[] | undefined)?.some(
            (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
          )))
    ) {
      return true;
    }
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (hasExportModifier(statement) && statement.name && (statement.name as Node).text === name) return true;
    } else if (ts.isVariableStatement(statement)) {
      if (hasExportModifier(statement)) {
        for (const decl of (statement.declarationList as Node).declarations as Node[]) {
          if (ts.isIdentifier(decl.name) && (decl.name as Node).text === name) return true;
        }
      }
    }
  }
  return false;
}

/**
 * The initializer bound to `name` as seen from `node`, resolved outwards through enclosing
 * scopes — `const body = <div />` in the component holding the Card, not the `const body` in
 * a sibling component further down the file.
 *
 * A file-wide map keyed by bare name (which this was) lets one component's variable answer for
 * another's, reporting a field at a line no Card ever contained. Same failure the `<file>#<name>`
 * cache key exists to prevent, arriving by the variable path instead of the export path.
 */
export function lookupVariable(node: Node, name: string): Node | null {
  for (let scope = node.parent as Node | undefined; scope; scope = scope.parent as Node | undefined) {
    // Blocks and the source file are the only `const` scopes that matter here.
    const statements = scope.statements as Node[] | undefined;
    if (!statements) continue;
    for (const statement of statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name && (statement.name as Node).text === name)
        return statement;
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of (statement.declarationList as Node).declarations as Node[]) {
        if (ts.isIdentifier(declaration.name) && (declaration.name as Node).text === name && declaration.initializer) {
          return declaration.initializer as Node;
        }
      }
    }
  }
  return null;
}
