import { readdirSync, readFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import { Node, Project } from 'ts-morph';

/**
 * Machine list visibility (ATT-843): a machine the caller may not see answers 404 on every per-machine route. The
 * interceptor does that for a whole controller, so this inventory fails when a controller that serves
 * `resources/:resourceId/...` or `resources/:id/...` lacks `@ResourceListVisible()`. A new route in such a controller
 * is covered by the class decorator; a new controller cannot skip it silently.
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

const stringArgument = (decorator: Node | undefined): string => {
  if (!decorator || !Node.isDecorator(decorator)) return '';
  const argument = decorator.getArguments()[0];
  return argument && Node.isStringLiteral(argument) ? argument.getLiteralValue() : '';
};

const MACHINE_PATH = /^resources\/:(resourceId|id)(\/|$)/;

function machineRouteControllers() {
  const project = new Project({ skipAddingFilesFromTsConfig: true, useInMemoryFileSystem: false });
  const found: { controller: string; routes: string[]; decorated: boolean }[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('@Controller(')) continue;
    for (const declaration of project.createSourceFile(file, text, { overwrite: true }).getClasses()) {
      const controller = declaration.getDecorator('Controller');
      if (!controller) continue;
      const base = stringArgument(controller).replace(/^\/+|\/+$/g, '');
      const routes: string[] = [];
      for (const method of declaration.getMethods()) {
        const route = method.getDecorators().find((decorator) => ROUTE_DECORATORS.has(decorator.getName()));
        if (!route) continue;
        const full = [base, stringArgument(route).replace(/^\/+|\/+$/g, '')].filter(Boolean).join('/');
        if (MACHINE_PATH.test(full)) routes.push(`${method.getName()} ${full}`);
      }
      if (routes.length > 0) {
        found.push({
          controller: `${relative(SRC, file)}:${declaration.getName()}`,
          routes,
          decorated: declaration.getDecorators().some((decorator) => decorator.getName() === 'ResourceListVisible'),
        });
      }
    }
  }
  return found;
}

describe('per-machine routes answer 404 for hidden machines (ATT-843)', () => {
  const controllers = machineRouteControllers();

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
      ]),
    );
    expect(controllers.flatMap((entry) => entry.routes).length).toBeGreaterThan(40);
  });

  it('puts @ResourceListVisible() on every controller that serves resources/:resourceId or resources/:id', () => {
    expect(
      controllers.filter((entry) => !entry.decorated).map((entry) => `${entry.controller}: ${entry.routes[0]}`),
    ).toEqual([]);
  });
});
