import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { Node, Project, type Decorator } from 'ts-morph';

/** The ts-morph scan behind the machine-route inventories of core and of the official plugins. */
const ROUTE_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Sse', 'All', 'Head', 'Options', 'Search']);

/** A machine id anywhere in the path, also under another prefix (`messaging/resources/:resourceId/contact`). */
const MACHINE_PATH = /(^|\/)resources\/:(resourceId|id)(\/|$)/;

export interface ScannedRoute {
  /** `method full/path` */
  route: string;
  /** The route parameter holding the machine id; undefined when the path names no machine. */
  machineParam?: string;
  /** Every parameter of the full path. */
  params: string[];
  /** The visibility decorator on the method itself. */
  decorator?: Decorator;
}

export interface ScannedController {
  /** `relative/file.ts:ClassName` */
  controller: string;
  /** The visibility decorator on the class. */
  classDecorator?: Decorator;
  routes: ScannedRoute[];
}

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

const trim = (path: string) => path.replace(/^\/+|\/+$/g, '');

/** Every route of every controller under `roots`, and the controllers and routes whose path cannot be read. */
export function scanControllers(base: string, roots: string[], visibilityDecorator: string) {
  const project = new Project({ skipAddingFilesFromTsConfig: true, useInMemoryFileSystem: false });
  const controllers: ScannedController[] = [];
  const unreadable: string[] = [];
  for (const file of roots.flatMap(sourceFiles)) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('@Controller(')) continue;
    for (const declaration of project.createSourceFile(file, text, { overwrite: true }).getClasses()) {
      const controller = declaration.getDecorator('Controller');
      if (!controller) continue;
      const name = `${relative(base, file)}:${declaration.getName()}`;
      const prefixes = pathArguments(controller);
      if (prefixes === null) unreadable.push(`${name} @Controller`);
      const entry: ScannedController = {
        controller: name,
        classDecorator: declaration.getDecorator(visibilityDecorator),
        routes: [],
      };
      for (const method of declaration.getMethods()) {
        const route = method.getDecorators().find((decorator) => ROUTE_DECORATORS.has(decorator.getName()));
        if (!route) continue;
        const paths = pathArguments(route);
        if (paths === null) {
          unreadable.push(`${name}.${method.getName()}`);
          continue;
        }
        for (const full of (prefixes ?? ['']).flatMap((prefix) =>
          paths.map((path) => [trim(prefix), trim(path)].filter(Boolean).join('/')),
        )) {
          entry.routes.push({
            route: `${method.getName()} ${full}`,
            machineParam: MACHINE_PATH.exec(full)?.[2],
            params: [...full.matchAll(/(?:^|\/):(\w+)/g)].map((match) => match[1]),
            decorator: method.getDecorator(visibilityDecorator),
          });
        }
      }
      controllers.push(entry);
    }
  }
  return { controllers, unreadable };
}
