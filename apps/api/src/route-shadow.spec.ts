/**
 * Route-shadow guard (ATT-534)
 *
 * In NestJS/Express, routes are matched in registration order — first registered
 * wins.  A :param segment matches ANY single segment, including static strings.
 * So if GET /users/:id is registered before GET /users/with-permission, Express
 * will route GET /users/with-permission to the :id handler and the static route
 * becomes unreachable.
 *
 * This spec performs static source analysis to assert that no :param route is
 * registered before a static route of the same HTTP method and the same URL
 * depth (segment count) when both controllers share the same @Controller(prefix).
 *
 * It checks two scenarios:
 *  1. Within a single controller file (intra-file order by line number).
 *  2. Across controllers in the same module (inter-file order by controllers[]
 *     array position).
 */

import { readdirSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

const API_SRC = __dirname;

// ─── Types ───────────────────────────────────────────────────────────────────

interface RouteDecl {
  method: string; // 'Get' | 'Post' | 'Put' | 'Patch' | 'Delete' | 'Sse'
  path: string; // normalised route path (no leading/trailing slash)
  lineNumber: number;
  segments: string[]; // split on '/'
}

interface ControllerInfo {
  className: string;
  prefix: string; // @Controller('prefix') value, normalised
  routes: RouteDecl[];
  filePath: string;
}

// ─── File discovery ───────────────────────────────────────────────────────────

function walkDir(dir: string, suffix: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist' && !entry.name.startsWith('.')) {
      results.push(...walkDir(join(dir, entry.name), suffix));
    } else if (entry.isFile() && entry.name.endsWith(suffix)) {
      results.push(join(dir, entry.name));
    }
  }
  return results;
}

// ─── Controller parsing ───────────────────────────────────────────────────────

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Sse'];

function normalisePath(raw: string): string {
  return raw.replace(/^\/+|\/+$/g, '').trim();
}

function pathSegments(path: string): string[] {
  const n = normalisePath(path);
  if (!n) return [];
  return n.split('/').filter(Boolean);
}

function isParam(segment: string): boolean {
  return segment.startsWith(':') || segment === '*' || segment.startsWith('*');
}

/**
 * Returns true when routeA (registered first) would intercept requests that
 * were meant for routeB (registered second).
 *
 * Conditions:
 *  - same HTTP method
 *  - same segment depth
 *  - for every segment position: A's segment is :param (matches anything) or
 *    A's segment literally equals B's segment
 *  - at least one position where A has :param and B has a static segment
 *    (otherwise they're the same or identical-static routes, not a shadow)
 */
function shadows(a: RouteDecl, b: RouteDecl): boolean {
  if (a.method !== b.method) return false;
  const sa = a.segments;
  const sb = b.segments;
  if (sa.length !== sb.length) return false;

  let paramVsStatic = false;
  for (let i = 0; i < sa.length; i++) {
    if (isParam(sa[i])) {
      if (!isParam(sb[i])) paramVsStatic = true;
      // :param matches anything → compatible
    } else if (sa[i] !== sb[i]) {
      // A's static segment doesn't match B's → A cannot intercept B
      return false;
    }
  }
  return paramVsStatic;
}

/**
 * Parse a controller source file.
 * Skips template-literal paths (back-tick) because we cannot evaluate
 * TypeScript expressions statically; those would need a full compiler run.
 */
function parseController(filePath: string): ControllerInfo | null {
  const content = readFileSync(filePath, 'utf-8');

  const classMatch = content.match(/export class (\w+)/);
  if (!classMatch) return null;
  const className = classMatch[1];

  // @Controller() or @Controller('prefix') or @Controller("prefix")
  const prefixMatch = content.match(/@Controller\(\s*(?:['"]([^'"]*)['"])?\s*\)/);
  const prefix = normalisePath(prefixMatch?.[1] ?? '');

  const routes: RouteDecl[] = [];
  const lines = content.split('\n');
  const methodRe = new RegExp(`@(${HTTP_METHODS.join('|')})\\(([^)]*)\\)`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = methodRe.exec(line);
    if (!m) continue;

    const method = m[1];
    const rawArg = m[2].trim();

    // Skip template literals — they contain dynamic expressions we can't evaluate
    if (rawArg.startsWith('`')) continue;

    // Extract the string value: '', 'path', "path"
    const pathMatch = rawArg.match(/^['"]([^'"]*)['"]$/) ?? rawArg.match(/^$/);
    const routePath = pathMatch ? (pathMatch[1] ?? '') : null;

    // If we can't parse the path statically, skip it
    if (routePath === null) continue;

    const segs = pathSegments(routePath);
    routes.push({ method, path: routePath, lineNumber: i + 1, segments: segs });
  }

  return { className, prefix, routes, filePath };
}

// ─── Module parsing ───────────────────────────────────────────────────────────

/**
 * Parse a module file's import map (class name → relative path).
 */
function parseImports(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const names = m[1].split(',').map((n) => (n.trim().split(/\s+as\s+/).pop() ?? '').trim());
    for (const name of names) {
      if (name) map.set(name, m[2]);
    }
  }
  return map;
}

/**
 * Extract controller class names in the order they appear in controllers: [...].
 * Returns an empty array if no controllers array is found.
 */
function parseControllersArray(content: string): string[] {
  // Match `controllers: [` then capture until the matching `]`
  const startIdx = content.search(/\bcontrollers\s*:\s*\[/);
  if (startIdx === -1) return [];

  let depth = 0;
  let inArray = false;
  let arrayContent = '';

  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === '[') {
      depth++;
      inArray = true;
      continue;
    }
    if (content[i] === ']') {
      depth--;
      if (depth === 0 && inArray) break;
      continue;
    }
    if (inArray) arrayContent += content[i];
  }

  // Split on commas, strip whitespace/comments, keep only valid identifiers
  return arrayContent
    .split(',')
    .map((s) => s.trim().replace(/\/\/.*$/, '').trim())
    .filter((s) => /^[A-Z]\w*$/.test(s));
}

// ─── Shadow detection ─────────────────────────────────────────────────────────

interface ShadowReport {
  moduleFile: string;
  shadowingController: string;
  shadowingRoute: RouteDecl;
  shadowedController: string;
  shadowedRoute: RouteDecl;
}

function detectShadowsInModule(
  modulePath: string,
  controllerMap: Map<string, ControllerInfo>,
): ShadowReport[] {
  const content = readFileSync(modulePath, 'utf-8');
  const importMap = parseImports(content);
  const controllerNames = parseControllersArray(content);

  if (controllerNames.length === 0) return [];

  const moduleDir = dirname(modulePath);

  // Resolve each name → ControllerInfo using the local import map or the global map
  const resolved: ControllerInfo[] = [];
  for (const name of controllerNames) {
    // Try the global map first (populated from file scanning)
    const existing = controllerMap.get(name);
    if (existing) {
      resolved.push(existing);
      continue;
    }
    // Try resolving via import map
    const importPath = importMap.get(name);
    if (!importPath) continue;
    const absolutePath = resolve(moduleDir, importPath + '.ts');
    const info = parseController(absolutePath);
    if (info) {
      controllerMap.set(info.className, info);
      resolved.push(info);
    }
  }

  // Group controllers by their @Controller(prefix)
  const byPrefix = new Map<string, ControllerInfo[]>();
  for (const info of resolved) {
    const group = byPrefix.get(info.prefix) ?? [];
    group.push(info);
    byPrefix.set(info.prefix, group);
  }

  const reports: ShadowReport[] = [];

  for (const [, group] of byPrefix) {
    if (group.length < 2) continue; // No cross-controller risk

    // Collect all routes across the group in registration order
    const allRoutes: Array<{ route: RouteDecl; controller: ControllerInfo }> = [];
    for (const ctrl of group) {
      for (const route of ctrl.routes) {
        allRoutes.push({ route, controller: ctrl });
      }
    }

    // Check every pair (earlier, later)
    for (let i = 0; i < allRoutes.length; i++) {
      for (let j = i + 1; j < allRoutes.length; j++) {
        const earlier = allRoutes[i];
        const later = allRoutes[j];
        if (shadows(earlier.route, later.route)) {
          reports.push({
            moduleFile: modulePath,
            shadowingController: earlier.controller.className,
            shadowingRoute: earlier.route,
            shadowedController: later.controller.className,
            shadowedRoute: later.route,
          });
        }
      }
    }
  }

  return reports;
}

function detectShadowsWithinController(info: ControllerInfo): ShadowReport[] {
  const reports: ShadowReport[] = [];
  for (let i = 0; i < info.routes.length; i++) {
    for (let j = i + 1; j < info.routes.length; j++) {
      if (shadows(info.routes[i], info.routes[j])) {
        reports.push({
          moduleFile: info.filePath,
          shadowingController: info.className,
          shadowingRoute: info.routes[i],
          shadowedController: info.className,
          shadowedRoute: info.routes[j],
        });
      }
    }
  }
  return reports;
}

// ─── Spec ─────────────────────────────────────────────────────────────────────

describe('Route-shadow guard (ATT-534)', () => {
  let controllerMap: Map<string, ControllerInfo>;
  let moduleFiles: string[];

  beforeAll(() => {
    const controllerFiles = walkDir(API_SRC, '.controller.ts').filter(
      (f) => !f.endsWith('.spec.ts') && !f.endsWith('.e2e.spec.ts'),
    );
    moduleFiles = walkDir(API_SRC, '.module.ts').filter(
      (f) => !f.endsWith('.spec.ts'),
    );

    controllerMap = new Map();
    for (const file of controllerFiles) {
      const info = parseController(file);
      if (info) controllerMap.set(info.className, info);
    }
  });

  it('no :param route shadows a static route within the same controller file', () => {
    const allShadows: ShadowReport[] = [];
    for (const [, info] of controllerMap) {
      allShadows.push(...detectShadowsWithinController(info));
    }

    const formatted = allShadows.map(
      (r) =>
        `  ${r.shadowingController} line ${r.shadowingRoute.lineNumber} ` +
        `@${r.shadowingRoute.method}('${r.shadowingRoute.path}') ` +
        `shadows line ${r.shadowedRoute.lineNumber} ` +
        `@${r.shadowedRoute.method}('${r.shadowedRoute.path}')`,
    );
    expect(formatted).toEqual([]);
  });

  it('no :param route in an earlier controller shadows a static route in a later controller sharing the same @Controller(prefix)', () => {
    const allShadows: ShadowReport[] = [];
    for (const modulePath of moduleFiles) {
      allShadows.push(...detectShadowsInModule(modulePath, controllerMap));
    }

    const formatted = allShadows.map(
      (r) =>
        `  In ${r.moduleFile.replace(API_SRC + '/', '')}:\n` +
        `    ${r.shadowingController} @${r.shadowingRoute.method}('${r.shadowingRoute.path}') ` +
        `shadows ${r.shadowedController} @${r.shadowedRoute.method}('${r.shadowedRoute.path}')`,
    );
    expect(formatted).toEqual([]);
  });
});
