import { readdirSync } from 'fs';
import { join } from 'path';
export // ─── Types ───────────────────────────────────────────────────────────────────

interface RouteDecl {
  method: string; // 'Get' | 'Post' | 'Put' | 'Patch' | 'Delete' | 'Sse'
  path: string; // normalised route path (no leading/trailing slash)
  lineNumber: number;
  segments: string[]; // split on '/'
}
export interface ControllerInfo {
  className: string;
  prefix: string; // @Controller('prefix') value, normalised
  routes: RouteDecl[];
  filePath: string;
}
export // ─── File discovery ───────────────────────────────────────────────────────────

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
export // ─── Controller parsing ───────────────────────────────────────────────────────

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Sse'];
export function normalisePath(raw: string): string {
  return raw.replace(/^\/+|\/+$/g, '').trim();
}
export function pathSegments(path: string): string[] {
  const n = normalisePath(path);
  if (!n) return [];
  return n.split('/').filter(Boolean);
}
export function isParam(segment: string): boolean {
  return segment.startsWith(':') || segment === '*' || segment.startsWith('*');
}
export /**
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
export // ─── Shadow detection ─────────────────────────────────────────────────────────

interface ShadowReport {
  moduleFile: string;
  shadowingController: string;
  shadowingRoute: RouteDecl;
  shadowedController: string;
  shadowedRoute: RouteDecl;
}
