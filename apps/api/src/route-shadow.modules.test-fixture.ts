import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { parseControllers } from './route-shadow.controllers.test-fixture';
import { ControllerInfo, RouteDecl, ShadowReport, shadows } from './route-shadow.paths.test-fixture';

export // ─── Module parsing ───────────────────────────────────────────────────────────

/**
 * Parse a module file's import map (class name → relative path).
 */
function parseImports(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const names = m[1].split(',').map((n) =>
      (
        n
          .trim()
          .split(/\s+as\s+/)
          .pop() ?? ''
      ).trim(),
    );
    for (const name of names) {
      if (name) map.set(name, m[2]);
    }
  }
  return map;
}
export /**
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
    .map((s) =>
      s
        .trim()
        .replace(/\/\/.*$/, '')
        .trim(),
    )
    .filter((s) => /^[A-Z]\w*$/.test(s));
}
export // ─── Shadow detection ─────────────────────────────────────────────────────────

function detectShadowsInModule(modulePath: string, controllerMap: Map<string, ControllerInfo>): ShadowReport[] {
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
    for (const info of parseControllers(absolutePath)) {
      controllerMap.set(info.className, info);
    }
    const resolvedInfo = controllerMap.get(name);
    if (resolvedInfo) resolved.push(resolvedInfo);
  }

  // Deduplicate by filePath: a file exporting multiple @Controller classes is
  // registered once; the same ControllerInfo object must not be counted twice.
  const seenFiles = new Set<string>();
  const deduped = resolved.filter((info) => {
    if (seenFiles.has(info.filePath)) return false;
    seenFiles.add(info.filePath);
    return true;
  });

  // Group controllers by their @Controller(prefix)
  const byPrefix = new Map<string, ControllerInfo[]>();
  for (const info of deduped) {
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
export function detectShadowsWithinController(info: ControllerInfo): ShadowReport[] {
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
