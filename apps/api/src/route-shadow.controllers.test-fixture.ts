import { dirname, resolve } from 'path';
import { ClassDeclaration, Node, Project, SyntaxKind } from 'ts-morph';
import {
  ControllerInfo,
  HTTP_METHODS,
  normalisePath,
  pathSegments,
  RouteDecl,
} from './route-shadow.paths.test-fixture';

const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });

function inheritedMethods(
  declaration: ClassDeclaration,
): Map<string, ReturnType<ClassDeclaration['getMethods']>[number]> {
  const methods = new Map(declaration.getMethods().map((method) => [method.getName(), method]));
  const base = declaration.getExtends()?.getExpression();
  if (!base || !Node.isIdentifier(base)) return methods;
  const source = declaration.getSourceFile();
  const imported = source
    .getImportDeclarations()
    .find((entry) =>
      entry.getNamedImports().some((name) => (name.getAliasNode()?.getText() ?? name.getName()) === base.getText()),
    );
  const relativePath = imported?.getModuleSpecifierValue();
  if (!relativePath?.startsWith('.')) return methods;
  const baseSource = project.addSourceFileAtPath(resolve(dirname(source.getFilePath()), `${relativePath}.ts`));
  const originalName = imported
    .getNamedImports()
    .find((name) => (name.getAliasNode()?.getText() ?? name.getName()) === base.getText())
    ?.getName();
  const baseDeclaration = baseSource.getClass(originalName ?? base.getText());
  if (!baseDeclaration) return methods;
  for (const [name, method] of inheritedMethods(baseDeclaration)) {
    if (!methods.has(name)) methods.set(name, method);
  }
  return methods;
}

function registeredMethodOrder(declaration: ClassDeclaration): string[] {
  const installed = declaration
    .getSourceFile()
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find(
      (call) =>
        call.getExpression().getText() === 'installInheritedMethods' &&
        call.getArguments()[0]?.getText() === declaration.getName(),
    );
  const names = installed?.getArguments()[1];
  return names && Node.isArrayLiteralExpression(names)
    ? names
        .getElements()
        .filter(Node.isStringLiteral)
        .map((name) => name.getLiteralValue())
    : [];
}

/** Follow the same own-method and inherited-method registration order as Nest. */
export function parseControllers(filePath: string): ControllerInfo[] {
  const source = project.addSourceFileAtPath(filePath);
  return source.getClasses().flatMap((declaration) => {
    const controller = declaration.getDecorator('Controller');
    if (!controller) return [];
    const prefixArgument = controller.getArguments()[0];
    const prefix = prefixArgument && Node.isStringLiteral(prefixArgument) ? prefixArgument.getLiteralValue() : '';
    const methods = inheritedMethods(declaration);
    const order = [...new Set([...registeredMethodOrder(declaration), ...methods.keys()])];
    const routes: RouteDecl[] = [];
    for (const name of order) {
      const method = methods.get(name);
      if (!method) continue;
      for (const decorator of method.getDecorators()) {
        if (!HTTP_METHODS.includes(decorator.getName())) continue;
        const argument = decorator.getArguments()[0];
        // Expressions and template literals retain the guard's existing exclusions.
        if (argument && !Node.isStringLiteral(argument)) continue;
        const path = argument && Node.isStringLiteral(argument) ? argument.getLiteralValue() : '';
        routes.push({
          method: decorator.getName(),
          path,
          lineNumber: method.getStartLineNumber(),
          segments: pathSegments(path),
        });
      }
    }
    return [{ className: declaration.getName(), prefix: normalisePath(prefix), routes, filePath }];
  });
}
