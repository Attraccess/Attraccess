import { readdirSync, readFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import { Node, Project } from 'ts-morph';

/**
 * Machine list visibility (ATT-843): a machine the caller may not see answers 404 on every per-machine route. The
 * interceptor does that for a whole controller or a single route, so this inventory fails when a route whose path
 * holds `resources/:resourceId` or `resources/:id` (under any prefix) is covered by neither. A new route in a
 * decorated controller is covered by the class decorator; a new controller cannot skip it silently.
 */
const SRC = resolve(__dirname);
const ROUTE_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Sse', 'All', 'Head', 'Options', 'Search']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') && !/\.(spec|test|d)\.ts$/.test(entry.name) ? [path] : [];
  });
}

/**
 * The paths a decorator names: [''] without an argument, null when the scan cannot read them. A substitution in a
 * template string reads as `:expr`, which can never hide a literal `resources/:resourceId`.
 */
const pathArguments = (decorator: Node | undefined): string[] | null => {
  if (!decorator || !Node.isDecorator(decorator)) return [''];
  const argument = decorator.getArguments()[0];
  if (!argument) return [''];
  const read = (node: Node): string | null => {
    if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) return node.getLiteralValue();
    if (Node.isTemplateExpression(node)) {
      return [
        node.getHead().getLiteralText(),
        ...node.getTemplateSpans().map((span) => `:expr${span.getLiteral().getLiteralText()}`),
      ].join('');
    }
    return null;
  };
  const nodes = Node.isArrayLiteralExpression(argument) ? argument.getElements() : [argument];
  const paths = nodes.map(read);
  return paths.every((path): path is string => path !== null) ? paths : null;
};

/** A machine id anywhere in the path, also under another prefix (`messaging/resources/:resourceId/contact`). */
const MACHINE_PATH = /(^|\/)resources\/:(resourceId|id)(\/|$)/;
const trim = (path: string) => path.replace(/^\/+|\/+$/g, '');
const hasVisibleDecorator = (node: { getDecorators(): { getName(): string }[] }) =>
  node.getDecorators().some((decorator) => decorator.getName() === 'ResourceListVisible');

interface ControllerEntry {
  controller: string;
  /** Machine routes; each is covered by the class decorator or its own. */
  routes: { route: string; decorated: boolean }[];
  classDecorated: boolean;
  /** Routes of a class-decorated controller whose `:id` is not a machine id: the interceptor would read it as one. */
  foreignIds: string[];
}

function scanControllers() {
  const project = new Project({ skipAddingFilesFromTsConfig: true, useInMemoryFileSystem: false });
  const found: ControllerEntry[] = [];
  const unreadable: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('@Controller(')) continue;
    for (const declaration of project.createSourceFile(file, text, { overwrite: true }).getClasses()) {
      const controller = declaration.getDecorator('Controller');
      if (!controller) continue;
      const name = `${relative(SRC, file)}:${declaration.getName()}`;
      const bases = pathArguments(controller);
      if (bases === null) unreadable.push(`${name} @Controller`);
      const classDecorated = hasVisibleDecorator(declaration);
      const entry: ControllerEntry = { controller: name, routes: [], classDecorated, foreignIds: [] };
      for (const method of declaration.getMethods()) {
        const route = method.getDecorators().find((decorator) => ROUTE_DECORATORS.has(decorator.getName()));
        if (!route) continue;
        const paths = pathArguments(route);
        if (paths === null) {
          unreadable.push(`${name}.${method.getName()}`);
          continue;
        }
        for (const full of (bases ?? ['']).flatMap((base) =>
          paths.map((path) => [trim(base), trim(path)].filter(Boolean).join('/')),
        )) {
          if (MACHINE_PATH.test(full)) {
            const decorated = classDecorated || hasVisibleDecorator(method);
            entry.routes.push({ route: `${method.getName()} ${full}`, decorated });
          } else if (classDecorated && /(^|\/):id(\/|$)/.test(full)) {
            entry.foreignIds.push(`${method.getName()} ${full}`);
          }
        }
      }
      if (entry.routes.length > 0 || entry.foreignIds.length > 0) found.push(entry);
    }
  }
  return { controllers: found, unreadable };
}

describe('per-machine routes answer 404 for hidden machines (ATT-843)', () => {
  const { controllers, unreadable } = scanControllers();

  it('finds the per-machine controllers, so the scan cannot silently check nothing', () => {
    const names = controllers.map((entry) => entry.controller.split(':')[1]);
    expect(names).toEqual(
      expect.arrayContaining([
        'ResourcesController',
        'SSEController',
        'SupervisionController',
        'ResourceUsageController',
        'ResourceIntroductionsController',
        'ResourceIntroducersController',
        'MessagingController',
      ]),
    );
    expect(controllers.flatMap((entry) => entry.routes).length).toBeGreaterThan(40);
  });

  it('can read every controller and route path, so no machine route hides behind a computed path', () => {
    expect(unreadable).toEqual([]);
  });

  it('puts @ResourceListVisible() on every route that serves resources/:resourceId or resources/:id', () => {
    expect(
      controllers.flatMap((entry) =>
        entry.routes.filter((route) => !route.decorated).map((route) => `${entry.controller}: ${route.route}`),
      ),
    ).toEqual([]);
  });

  it('keeps `:id` for machine ids in controllers decorated as a whole, because the interceptor reads it as one', () => {
    expect(controllers.flatMap((entry) => entry.foreignIds.map((route) => `${entry.controller}: ${route}`))).toEqual(
      [],
    );
  });
});
