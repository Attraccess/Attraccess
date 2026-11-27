import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  UseGetFlowLogRecordingStatusKeyFn,
  UseGetGlobalFlowLogRecordingStatusKeyFn,
  type ResourceFlowNodeSchemaDto,
} from '@attraccess/react-query-client';
import {
  findUnsupportedNodeTypes,
  flowOwnerKey,
  flowScopeOf,
  schemaSupportsOwner,
  useKeepFlowLogRecordingAliveRequest,
  type FlowOwner,
} from './flowOwner';

const keepAlive = vi.hoisted(() => ({ resource: vi.fn(), global: vi.fn() }));
const recordingStatus = { isRecording: true, startedAt: '2026-09-01T12:00:00Z', expiresAt: '2026-09-01T12:15:00Z' };

vi.mock('@attraccess/react-query-client', async (importOriginal) => {
  const fake =
    (calls: (variables: unknown) => void) => (_key: unknown, options: { onSuccess: (data: unknown) => void }) => ({
      mutate: (variables: unknown) => {
        calls(variables);
        options.onSuccess(recordingStatus);
      },
    });
  return {
    ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
    useKeepFlowLogRecordingAlive: fake(keepAlive.resource),
    useKeepGlobalFlowLogRecordingAlive: fake(keepAlive.global),
  };
});

const resource: FlowOwner = { kind: 'resource', resourceId: 4 };
const global: FlowOwner = { kind: 'global', flowId: 4 };
const schema = (supportedByResource: boolean, scopes: Array<'resource' | 'global'>) =>
  ({ type: 'x', supportedByResource, supportedFlowScopes: scopes }) as unknown as ResourceFlowNodeSchemaDto;

describe('flow owner', () => {
  it('derives scope and a distinct identity per owner kind', () => {
    expect(flowScopeOf(resource)).toBe('resource');
    expect(flowScopeOf(global)).toBe('global');
    expect(flowOwnerKey(resource)).not.toBe(flowOwnerKey(global));
  });

  it('filters schemas by scope, applying supportedByResource to resource flows only', () => {
    expect(schemaSupportsOwner(schema(true, ['resource']), resource)).toBe(true);
    expect(schemaSupportsOwner(schema(true, ['resource']), global)).toBe(false);
    expect(schemaSupportsOwner(schema(true, ['global']), resource)).toBe(false);
    expect(schemaSupportsOwner(schema(false, ['resource', 'global']), resource)).toBe(false);
    expect(schemaSupportsOwner(schema(false, ['resource', 'global']), global)).toBe(true);
  });

  it('finds imported nodes the owner cannot hold, using the catalogue rules', () => {
    const schemas = [
      { ...schema(true, ['resource']), type: 'resource-only' },
      { ...schema(false, ['resource', 'global']), type: 'not-for-this-resource' },
      { ...schema(true, ['resource', 'global']), type: 'both' },
    ] as ResourceFlowNodeSchemaDto[];
    const nodes = [{ type: 'resource-only' }, { type: 'not-for-this-resource' }, { type: 'both' }, { type: 'unknown' }];

    expect(findUnsupportedNodeTypes(nodes, schemas, resource)).toEqual(['not-for-this-resource', 'unknown']);
    expect(findUnsupportedNodeTypes(nodes, schemas, global)).toEqual(['resource-only', 'unknown']);
  });
});

describe('useKeepFlowLogRecordingAliveRequest', () => {
  it.each([
    {
      owner: { kind: 'resource', resourceId: 4 } as FlowOwner,
      calls: keepAlive.resource,
      path: { resourceId: 4 },
      key: UseGetFlowLogRecordingStatusKeyFn({ path: { resourceId: 4 } }),
    },
    {
      owner: { kind: 'global', flowId: 4 } as FlowOwner,
      calls: keepAlive.global,
      path: { flowId: 4 },
      key: UseGetGlobalFlowLogRecordingStatusKeyFn({ path: { flowId: 4 } }),
    },
  ])('keeps the $owner.kind recording alive and stores the returned status', ({ owner, calls, path, key }) => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useKeepFlowLogRecordingAliveRequest(owner), { wrapper });

    result.current();

    expect(calls).toHaveBeenCalledWith({ path });
    expect(queryClient.getQueryData(key)).toEqual(recordingStatus);
  });
});
