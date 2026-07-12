// Catalog state hook: groups schemas by domain and persists UI state to localStorage
// FEATURE: Node catalog redesign — state management
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { ResourceFlowNodeSchemaDto, useResourceFlowsServiceGetNodeSchemas } from '@attraccess/react-query-client';
import { Domain, DOMAIN_ORDER, nodeTypeDomain } from './domains';

export type Direction = 'down' | 'up' | 'both';

export interface CatalogNode {
  schema: ResourceFlowNodeSchemaDto;
  direction: Direction;
}

export interface CatalogGroup {
  domain: Domain;
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
  isDomainExpanded: (domain: Domain) => boolean;
  setDomainExpanded: (domain: Domain, next: boolean) => void;
}

const STORAGE_KEY_COLLAPSED = 'nodeCatalog.collapsed';
const STORAGE_KEY_EXPANDED_PREFIX = 'nodeCatalog.expanded.';

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

function useExpandedSnapshot(): string {
  return useSyncExternalStore(
    subscribeToStorage,
    () => {
      if (typeof window === 'undefined') return '';
      const parts: string[] = [];
      for (const key of DOMAIN_ORDER) {
        parts.push(key + '=' + (readBool(STORAGE_KEY_EXPANDED_PREFIX + key, true) ? '1' : '0'));
      }
      return parts.join('|');
    },
    () => '',
  );
}

export function useNodeCatalog({ resourceId }: UseNodeCatalogArgs): UseNodeCatalogResult {
  const { data: schemas, isLoading, isError } = useResourceFlowsServiceGetNodeSchemas({ resourceId });

  const groups = useMemo<CatalogGroup[]>(() => {
    const byDomain = new Map<Domain, CatalogNode[]>();
    for (const schema of schemas ?? []) {
      if (!schema.supportedByResource) continue;
      const domain = nodeTypeDomain(schema.type);
      const list = byDomain.get(domain) ?? [];
      list.push({ schema, direction: getDirection(schema) });
      byDomain.set(domain, list);
    }
    return DOMAIN_ORDER.filter((d) => byDomain.has(d)).map((d) => ({ domain: d, nodes: byDomain.get(d) ?? [] }));
  }, [schemas]);

  const [collapsed, setCollapsed] = useStoredBool(STORAGE_KEY_COLLAPSED, false);

  const expandedSnapshot = useExpandedSnapshot();

  const isDomainExpanded = useCallback(
    (domain: Domain) => {
      const entry = expandedSnapshot.split('|').find((p) => p.startsWith(domain + '='));
      if (!entry) return true;
      return entry.endsWith('=1');
    },
    [expandedSnapshot],
  );

  const setDomainExpanded = useCallback((domain: Domain, next: boolean) => {
    writeBool(STORAGE_KEY_EXPANDED_PREFIX + domain, next);
  }, []);

  return { groups, isLoading, isError, collapsed, setCollapsed, isDomainExpanded, setDomainExpanded };
}
