// Catalog state hook: groups schemas by domain and persists UI state to localStorage
// FEATURE: Node catalog redesign — state management
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { ResourceFlowNodeSchemaDto, useResourceFlowsServiceGetNodeSchemas } from '@attraccess/react-query-client';
import { DOMAIN_ORDER, nodeTypeDomain } from './domains';

export type Direction = 'down' | 'up' | 'both';

export interface CatalogNode {
  schema: ResourceFlowNodeSchemaDto;
  direction: Direction;
}

export interface CatalogGroup {
  domain: string;
  nodes: CatalogNode[];
}

interface UseNodeCatalogArgs {
  resourceId: number;
}

interface UseNodeCatalogResult {
  groups: CatalogGroup[];
  isLoading: boolean;
  isError: boolean;
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  isDomainExpanded: (domain: string) => boolean;
  setDomainExpanded: (domain: string, next: boolean) => void;
}

const STORAGE_KEY_COLLAPSED = 'nodeCatalog.collapsed';
const STORAGE_KEY_EXPANDED_PREFIX = 'nodeCatalog.expanded.';
const STORAGE_KEY_VERSION = 'nodeCatalog.storageVersion';
const STORAGE_VERSION = '2';
const LEGACY_EXPANDED_DOMAINS: Record<string, string[]> = {
  'usage-sessions': ['resource', 'triggers'],
  'operation-activity': ['resource', 'triggers'],
  billing: ['resource'],
  'access-doors': ['door', 'triggers'],
  'health-monitoring': ['health'],
  'companion-device': ['companion', 'triggers'],
  messaging: ['mqtt', 'triggers'],
  'web-requests': ['http'],
  'flow-control': ['manual', 'logic', 'triggers'],
};

function migrateExpandedDomains(domains: string[]): void {
  if (typeof window === 'undefined' || window.localStorage.getItem(STORAGE_KEY_VERSION) === STORAGE_VERSION) return;

  const domainMappings = {
    ...LEGACY_EXPANDED_DOMAINS,
    ...Object.fromEntries(domains.filter((domain) => domain.startsWith('plugin.')).map((domain) => [domain, ['triggers']])),
  };
  for (const [domain, legacyDomains] of Object.entries(domainMappings)) {
    const key = STORAGE_KEY_EXPANDED_PREFIX + domain;
    if (window.localStorage.getItem(key) !== null) continue;

    const legacyKeys = legacyDomains.map((legacy) => STORAGE_KEY_EXPANDED_PREFIX + legacy);
    if (legacyKeys.some((legacyKey) => window.localStorage.getItem(legacyKey) === 'false')) {
      window.localStorage.setItem(key, 'false');
    }
  }

  for (const legacyDomains of Object.values(LEGACY_EXPANDED_DOMAINS)) {
    for (const domain of legacyDomains) {
      window.localStorage.removeItem(STORAGE_KEY_EXPANDED_PREFIX + domain);
    }
  }
  window.localStorage.setItem(STORAGE_KEY_VERSION, STORAGE_VERSION);
}

function getDirection(schema: ResourceFlowNodeSchemaDto): Direction {
  if (schema.isOutput) return 'up';
  if (schema.inputs.length === 0 && schema.outputs.length > 0) return 'down';
  if (schema.inputs.length > 0 && schema.outputs.length === 0) return 'up';
  return 'both';
}

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

function writeBool(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, String(value));
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: String(value) }));
}

function readDomainExpanded(domain: string): boolean {
  return readBool(STORAGE_KEY_EXPANDED_PREFIX + domain, true);
}

function subscribeToStorage(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function useStoredBool(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    subscribeToStorage,
    () => (readBool(key, fallback) ? 'true' : 'false'),
    () => (fallback ? 'true' : 'false'),
  );
  const setter = useCallback((next: boolean) => writeBool(key, next), [key]);
  return [value === 'true', setter];
}

// ponytail: domains list is passed in so plugin domains trigger re-renders correctly.
function useExpandedSnapshot(domains: string[]): string {
  return useSyncExternalStore(
    subscribeToStorage,
    () => {
      if (typeof window === 'undefined') return '';
      return domains.map((key) => key + '=' + (readDomainExpanded(key) ? '1' : '0')).join('|');
    },
    () => '',
  );
}

export function useNodeCatalog({ resourceId }: UseNodeCatalogArgs): UseNodeCatalogResult {
  const { data: schemas, isLoading, isError } = useResourceFlowsServiceGetNodeSchemas({ resourceId });

  const groups = useMemo<CatalogGroup[]>(() => {
    const byDomain = new Map<string, CatalogNode[]>();
    for (const schema of schemas ?? []) {
      if (!schema.supportedByResource) continue;
      const domain = nodeTypeDomain(schema.type);
      const list = byDomain.get(domain) ?? [];
      list.push({ schema, direction: getDirection(schema) });
      byDomain.set(domain, list);
    }
    // Static core domains first (in declared order), then plugin domains sorted alphabetically.
    const staticGroups = DOMAIN_ORDER.filter((d) => byDomain.has(d)).map((d) => ({
      domain: d,
      nodes: byDomain.get(d) ?? [],
    }));
    const pluginDomains = Array.from(byDomain.keys())
      .filter((d) => d.startsWith('plugin.'))
      .sort();
    const pluginGroups = pluginDomains.map((d) => ({ domain: d, nodes: byDomain.get(d) ?? [] }));
    return [...staticGroups, ...pluginGroups];
  }, [schemas]);

  const allDomains = useMemo(() => groups.map((g) => g.domain), [groups]);
  migrateExpandedDomains(allDomains);

  const [collapsed, setCollapsed] = useStoredBool(STORAGE_KEY_COLLAPSED, false);

  const expandedSnapshot = useExpandedSnapshot(allDomains);

  const isDomainExpanded = useCallback(
    (domain: string) => {
      const entry = expandedSnapshot.split('|').find((p) => p.startsWith(domain + '='));
      if (!entry) return true;
      return entry.endsWith('=1');
    },
    [expandedSnapshot],
  );

  const setDomainExpanded = useCallback((domain: string, next: boolean) => {
    writeBool(STORAGE_KEY_EXPANDED_PREFIX + domain, next);
  }, []);

  return { groups, isLoading, isError, collapsed, setCollapsed, isDomainExpanded, setDomainExpanded };
}
