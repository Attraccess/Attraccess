// Tests for useNodeCatalog hook covering grouping, direction, and localStorage state
// FEATURE: Node catalog redesign — state management
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNodeCatalog } from './useNodeCatalog';

let mockIsLoading = false;

vi.mock('@attraccess/react-query-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@attraccess/react-query-client')>();
  return {
    ...actual,
    useResourceFlowsServiceGetNodeSchemas: () => ({
      isLoading: mockIsLoading,
      data: mockIsLoading
        ? undefined
        : [
            {
              type: 'input.button',
              inputs: [],
              outputs: ['output'],
              isOutput: false,
              supportedByResource: true,
              configSchema: {},
            },
            {
              type: 'input.resource.door.locked',
              inputs: [],
              outputs: ['output'],
              isOutput: false,
              supportedByResource: true,
              configSchema: {},
            },
            {
              type: 'output.http.sendRequest',
              inputs: ['input'],
              outputs: [],
              isOutput: true,
              supportedByResource: true,
              configSchema: {},
            },
            {
              type: 'processing.wait',
              inputs: ['input'],
              outputs: ['output'],
              isOutput: false,
              supportedByResource: true,
              configSchema: {},
            },
            {
              type: 'input.mqtt.message.received',
              inputs: [],
              outputs: ['output'],
              isOutput: false,
              supportedByResource: false,
              configSchema: {},
            },
            {
              type: 'plugin.example.trigger',
              inputs: [],
              outputs: ['output'],
              isOutput: false,
              isInput: true,
              supportedByResource: true,
              configSchema: {},
            },
          ],
    }),
  };
});

describe('useNodeCatalog', () => {
  beforeEach(() => {
    mockIsLoading = false;
    window.localStorage.clear();
  });

  it('groups supported schemas by domain in DOMAIN_ORDER', () => {
    const { result } = renderHook(() => useNodeCatalog({ resourceId: 1 }));
    const domains = result.current.groups.map((g) => g.domain);
    expect(domains).toEqual(['access-doors', 'web-requests', 'flow-control', 'plugin.example']);
    expect(result.current.groups.find((g) => g.domain === 'flow-control')?.nodes).toHaveLength(2);
    expect(result.current.groups.find((g) => g.domain === 'access-doors')?.nodes).toHaveLength(1);
  });

  it('omits unsupported schemas', () => {
    const { result } = renderHook(() => useNodeCatalog({ resourceId: 1 }));
    const mqttGroup = result.current.groups.find((g) => g.domain === 'mqtt');
    expect(mqttGroup).toBeUndefined();
  });

  it('annotates each row with a direction (down/up/both)', () => {
    const { result } = renderHook(() => useNodeCatalog({ resourceId: 1 }));
    const rows = result.current.groups.flatMap((g) => g.nodes);
    expect(rows.find((n) => n.schema.type === 'input.button')?.direction).toBe('down');
    expect(rows.find((n) => n.schema.type === 'output.http.sendRequest')?.direction).toBe('up');
    expect(rows.find((n) => n.schema.type === 'processing.wait')?.direction).toBe('both');
  });

  it('expands all domains by default and toggles via setDomainExpanded', () => {
    const { result } = renderHook(() => useNodeCatalog({ resourceId: 1 }));
    expect(result.current.isDomainExpanded('flow-control')).toBe(true);
    act(() => result.current.setDomainExpanded('flow-control', false));
    expect(result.current.isDomainExpanded('flow-control')).toBe(false);
    expect(window.localStorage.getItem('nodeCatalog.expanded.flow-control')).toBe('false');
  });

  it('hydrates expanded state from localStorage', () => {
    window.localStorage.setItem('nodeCatalog.expanded.door', 'false');
    const { result } = renderHook(() => useNodeCatalog({ resourceId: 1 }));
    expect(result.current.isDomainExpanded('access-doors')).toBe(false);
  });

  it('preserves a collapsed legacy triggers category for its replacement groups', () => {
    window.localStorage.setItem('nodeCatalog.expanded.triggers', 'false');
    const { result } = renderHook(() => useNodeCatalog({ resourceId: 1 }));
    expect(result.current.isDomainExpanded('access-doors')).toBe(false);
    expect(result.current.isDomainExpanded('flow-control')).toBe(false);
    expect(result.current.isDomainExpanded('plugin.example')).toBe(false);
  });

  it('toggles sidebar collapsed state and persists it', () => {
    const { result } = renderHook(() => useNodeCatalog({ resourceId: 1 }));
    expect(result.current.collapsed).toBe(false);
    act(() => result.current.setCollapsed(true));
    expect(result.current.collapsed).toBe(true);
    expect(window.localStorage.getItem('nodeCatalog.collapsed')).toBe('true');
  });

  it('updates isDomainExpanded result after setDomainExpanded across renders', () => {
    const { result, rerender } = renderHook(() => useNodeCatalog({ resourceId: 1 }));
    expect(result.current.isDomainExpanded('flow-control')).toBe(true);
    act(() => result.current.setDomainExpanded('flow-control', false));
    rerender();
    expect(result.current.isDomainExpanded('flow-control')).toBe(false);
  });

  it('returns at least one group when supported schemas exist', () => {
    const { result } = renderHook(() => useNodeCatalog({ resourceId: 1 }));
    expect(Array.isArray(result.current.groups)).toBe(true);
    expect(result.current.groups.length).toBeGreaterThan(0);
  });

  it('surfaces isLoading from the query', () => {
    mockIsLoading = true;
    const { result } = renderHook(() => useNodeCatalog({ resourceId: 1 }));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.groups).toHaveLength(0);
  });

  it('isLoading is false when schemas are available', () => {
    const { result } = renderHook(() => useNodeCatalog({ resourceId: 1 }));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.groups.length).toBeGreaterThan(0);
  });
});
