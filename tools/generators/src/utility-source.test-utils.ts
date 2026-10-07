import * as fs from 'fs';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-explicit-any */

// typescript@7's package exports no longer expose the classic compiler API to the type
// system, but it is still there at runtime. Require it untyped rather than pull in a
// second parser just for this check.
export const ts = require('typescript');

export function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, out);
    else if (/\.[jt]sx?$/.test(entry.name) && !/\.(spec|test)\.[jt]sx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Locally authored CSS selectors are intentionally not Tailwind candidates. */
export function customClasses(dir: string, classes = new Set<string>()): Set<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) customClasses(full, classes);
    else if (entry.name.endsWith('.css')) {
      for (const match of fs.readFileSync(full, 'utf8').matchAll(/\.([_a-zA-Z][\w-]*)/g)) classes.add(match[1]);
    }
  }
  return classes;
}

export function addClassTokens(node: any, classes: Set<string>): void {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  ) {
    for (const token of node.text.split(/\s+/)) if (token) classes.add(token);
  }
}

export function isLiteralClassExpression(node: any): boolean {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))
    return true;
  if (ts.isParenthesizedExpression(node)) return isLiteralClassExpression(node.expression);
  if (ts.isConditionalExpression(node))
    return isLiteralClassExpression(node.whenTrue) && isLiteralClassExpression(node.whenFalse);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
    return isLiteralClassExpression(node.right);
  if (ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node)) return true;
  return false;
}

export function localConstInitializer(identifier: any, checker: any): any {
  const declaration = checker.getSymbolAtLocation(identifier)?.valueDeclaration;
  if (
    declaration &&
    ts.isVariableDeclaration(declaration) &&
    ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0 &&
    declaration.initializer &&
    isLiteralClassExpression(declaration.initializer)
  )
    return declaration.initializer;
}

export function classExpression(node: any, classes: Set<string>, checker: any, seen = new Set<any>()): void {
  if (seen.has(node)) return;
  seen.add(node);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return addClassTokens(node, classes);
  if (ts.isIdentifier(node)) {
    const initializer = localConstInitializer(node, checker);
    if (initializer) return classExpression(initializer, classes, checker, seen);
    return;
  }
  if (ts.isTemplateExpression(node)) {
    addClassTokens(node.head, classes);
    for (const span of node.templateSpans) {
      classExpression(span.expression, classes, checker, seen);
      addClassTokens(span.literal, classes);
    }
    return;
  }
  if (ts.isParenthesizedExpression(node)) return classExpression(node.expression, classes, checker, seen);
  if (ts.isConditionalExpression(node)) {
    classExpression(node.whenTrue, classes, checker, seen);
    return classExpression(node.whenFalse, classes, checker, seen);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return classExpression(node.right, classes, checker, seen);
  }
  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) classExpression(element, classes, checker, seen);
    return;
  }
  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        if (ts.isStringLiteral(property.name)) addClassTokens(property.name, classes);
        else if (ts.isIdentifier(property.name)) classes.add(property.name.text);
      } else if (ts.isShorthandPropertyAssignment(property)) classes.add(property.name.text);
    }
    return;
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    ['cn', 'clsx', 'twMerge'].includes(node.expression.text)
  ) {
    for (const argument of node.arguments) classExpression(argument, classes, checker, seen);
  }
}

export function classesInSource(file: string, content: string): Set<string> {
  // Local lexical resolution needs a checker, not imported modules or standard libraries.
  const options = { allowJs: true, jsx: ts.JsxEmit.Preserve, noResolve: true, noLib: true };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name: string, languageVersion: any) =>
    name === file
      ? ts.createSourceFile(file, content, languageVersion, true, ts.ScriptKind.TSX)
      : getSourceFile(name, languageVersion);
  const program = ts.createProgram([file], options, host);
  const source = program.getSourceFile(file);
  if (!source) throw new Error(`Cannot parse ${file}`);
  const checker = program.getTypeChecker();
  const classes = new Set<string>();

  const visit = (node: any): void => {
    if (ts.isJsxAttribute(node) && node.name.text === 'className' && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) addClassTokens(node.initializer, classes);
      else if (ts.isJsxExpression(node.initializer) && node.initializer.expression)
        classExpression(node.initializer.expression, classes, checker);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['cn', 'clsx', 'twMerge'].includes(node.expression.text)
    ) {
      for (const argument of node.arguments) classExpression(argument, classes, checker);
    }
    node.forEachChild(visit);
  };
  visit(source);
  return classes;
}

export function classesIn(file: string): Set<string> {
  return classesInSource(file, fs.readFileSync(file, 'utf8'));
}
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'public']);
