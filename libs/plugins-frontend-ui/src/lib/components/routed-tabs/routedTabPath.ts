import type { RoutedTabItem } from './RoutedTabs';

/** `/matter` + `devices` → `/matter/devices`; an empty tab path is the base itself. */
export function routedTabPath(basePath: string, tabPath: string): string {
  return tabPath ? `${basePath}/${tabPath}` : basePath;
}

/** The first path segment below `basePath`, or `''` when the path is the base or outside it. */
export function firstSegmentBelow(basePath: string, pathname: string): string {
  if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) return '';
  return pathname.slice(basePath.length).replace(/^\/+/, '').split('/')[0] ?? '';
}

/** The tab the location belongs to, or undefined when no (visible) tab matches. */
export function activeRoutedTab<T extends Pick<RoutedTabItem, 'path'>>(
  visible: readonly T[],
  basePath: string,
  pathname: string,
): T | undefined {
  const segment = firstSegmentBelow(basePath, pathname);
  return visible.find((item) => item.path === segment);
}
