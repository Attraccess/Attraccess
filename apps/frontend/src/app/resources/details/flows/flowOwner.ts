import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  FlowLogRecordingDto,
  ResourceFlowResponseDto,
  ResourceFlowSaveDto,
  UseGetGlobalFlowCanvasKeyFn,
  useGetGlobalFlowLogRecordingStatusKey,
  useGetFlowLogRecordingStatusKey,
  UseGetResourceFlowKeyFn,
  useGetGlobalFlowCanvas,
  useGetGlobalFlowLogRecordingStatus,
  useGetGlobalFlowLogs,
  useGetGlobalFlowNodeSchemas,
  useResolveGlobalFlowNodeSchema,
  useSaveGlobalFlowCanvas,
  useStartGlobalFlowLogRecording,
  useStopGlobalFlowLogRecording,
  useGetFlowLogRecordingStatus,
  useGetNodeSchemas,
  useGetResourceFlow,
  useGetResourceFlowLogs,
  useResolveNodeSchema,
  useSaveResourceFlow,
  useStartFlowLogRecording,
  useStopFlowLogRecording,
  ResourceFlowNodeSchemaDto,
  resolveGlobalFlowNodePreview,
  resolveNodePreview,
} from '@attraccess/react-query-client';

/**
 * Who a flow belongs to. The editor, node catalogue, log viewer and node forms are the same for
 * both kinds; only the API they talk to differs, and that choice is made in this file.
 */
export type FlowOwner = { kind: 'resource'; resourceId: number } | { kind: 'global'; flowId: number };

export type FlowScope = 'resource' | 'global';

export function flowScopeOf(owner: FlowOwner): FlowScope {
  return owner.kind;
}

/** Stable identity of an owner, for React keys and query keys. */
export function flowOwnerKey(owner: FlowOwner): string {
  return owner.kind === 'resource' ? `resource:${owner.resourceId}` : `global:${owner.flowId}`;
}

/** Whether a node schema may be used in a flow of this owner. */
export function schemaSupportsOwner(schema: ResourceFlowNodeSchemaDto, owner: FlowOwner): boolean {
  if (!schema.supportedFlowScopes?.includes(flowScopeOf(owner))) return false;
  // supportedByResource only describes the resource a flow belongs to, so it is meaningless for global flows.
  return owner.kind === 'global' || schema.supportedByResource;
}

/** Types of the given nodes this owner's flow cannot hold; a node without a schema counts as unsupported. */
export function findUnsupportedNodeTypes(
  nodes: ReadonlyArray<{ type: string }>,
  schemas: ResourceFlowNodeSchemaDto[],
  owner: FlowOwner,
): string[] {
  return nodes
    .filter((node) => {
      const schema = schemas.find((candidate) => candidate.type === node.type);
      return !schema || !schemaSupportsOwner(schema, owner);
    })
    .map((node) => node.type);
}

// The generated hooks are one set per controller. Both sets are always called, the one that does not
// match the owner is disabled; an owner never changes during the lifetime of a mounted component.
const ID_FALLBACK = 0;
const resourceIdOf = (owner: FlowOwner) => (owner.kind === 'resource' ? owner.resourceId : ID_FALLBACK);
const flowIdOf = (owner: FlowOwner) => (owner.kind === 'global' ? owner.flowId : ID_FALLBACK);

export function useFlowCanvasQuery(owner: FlowOwner) {
  const resource = useGetResourceFlow({ path: { resourceId: resourceIdOf(owner) } }, undefined, {
    enabled: owner.kind === 'resource' && owner.resourceId > 0,
  });
  const global = useGetGlobalFlowCanvas({ path: { flowId: flowIdOf(owner) } }, undefined, {
    enabled: owner.kind === 'global' && owner.flowId > 0,
  });
  return (owner.kind === 'resource' ? resource : global) as {
    data: ResourceFlowResponseDto | undefined;
    isFetching: boolean;
    isError: boolean;
  };
}

export function useFlowNodeSchemasQuery(owner: FlowOwner) {
  const resource = useGetNodeSchemas({ path: { resourceId: resourceIdOf(owner) } }, undefined, {
    enabled: owner.kind === 'resource',
  });
  const global = useGetGlobalFlowNodeSchemas({}, undefined, {
    enabled: owner.kind === 'global',
  });
  return (owner.kind === 'resource' ? resource : global) as {
    data: ResourceFlowNodeSchemaDto[] | undefined;
    isLoading: boolean;
    isError: boolean;
  };
}

export function useSaveFlowCanvas(
  owner: FlowOwner,
  options: { onSuccess?: () => void; onError?: (error: ApiError) => void },
) {
  const queryClient = useQueryClient();
  const onSuccess = () => {
    void queryClient.invalidateQueries({
      queryKey:
        owner.kind === 'resource'
          ? UseGetResourceFlowKeyFn({ path: { resourceId: owner.resourceId } })
          : UseGetGlobalFlowCanvasKeyFn({ path: { flowId: owner.flowId } }),
    });
    options.onSuccess?.();
  };
  const onError = (error: unknown) => options.onError?.(error as ApiError);
  const resource = useSaveResourceFlow(undefined, { onSuccess, onError });
  const global = useSaveGlobalFlowCanvas(undefined, { onSuccess, onError });
  const active = owner.kind === 'resource' ? resource : global;

  const save = useCallback(
    (requestBody: ResourceFlowSaveDto) => {
      if (owner.kind === 'resource') resource.mutate({ path: { resourceId: owner.resourceId }, body: requestBody });
      else global.mutate({ path: { flowId: owner.flowId }, body: requestBody });
    },
    [owner, resource, global],
  );
  return { save, isError: active.isError, isPending: active.isPending };
}

/** Resolves a dynamic (plugin) node schema for a node configuration. */
export function useResolveFlowNodeSchema(owner: FlowOwner) {
  const resource = useResolveNodeSchema<ResourceFlowNodeSchemaDto>();
  const global = useResolveGlobalFlowNodeSchema<ResourceFlowNodeSchemaDto>();
  const resourceMutate = resource.mutateAsync;
  const globalMutate = global.mutateAsync;
  return useCallback(
    (nodeType: string, config: Record<string, unknown>) =>
      owner.kind === 'resource'
        ? resourceMutate({ path: { resourceId: owner.resourceId, nodeType }, body: { config } })
        : globalMutate({ path: { flowId: owner.flowId, nodeType }, body: { config } }),
    [owner, resourceMutate, globalMutate],
  );
}

export function resolveFlowNodePreview(owner: FlowOwner, nodeType: string, config: Record<string, unknown>) {
  return owner.kind === 'resource'
    ? resolveNodePreview({
        path: { resourceId: owner.resourceId, nodeType },
        body: { config },
        throwOnError: true,
      }).then(({ data }) => data)
    : resolveGlobalFlowNodePreview({
        path: { flowId: owner.flowId, nodeType },
        body: { config },
        throwOnError: true,
      }).then(({ data }) => data);
}

/** Recording status, buffered logs and start/stop of the log viewer. */
export function useFlowLogRecording(owner: FlowOwner, opts: { isOpen: boolean }) {
  const queryClient = useQueryClient();
  const refetchInterval = opts.isOpen ? 10_000 : false;
  const resourceStatus = useGetFlowLogRecordingStatus({ path: { resourceId: resourceIdOf(owner) } }, undefined, {
    enabled: owner.kind === 'resource',
    refetchInterval,
  });
  const globalStatus = useGetGlobalFlowLogRecordingStatus({ path: { flowId: flowIdOf(owner) } }, undefined, {
    enabled: owner.kind === 'global',
    refetchInterval,
  });
  const recording = (owner.kind === 'resource' ? resourceStatus.data : globalStatus.data) as
    FlowLogRecordingDto | undefined;
  const isRecording = recording?.isRecording ?? false;
  const logsEnabled = opts.isOpen && isRecording;

  // The generated key defaults to [{ id }]; startedAt makes it per-recording.
  const resourceLogs = useGetResourceFlowLogs(
    { path: { resourceId: resourceIdOf(owner) } },
    [{ resourceId: resourceIdOf(owner) }, recording?.startedAt],
    { enabled: owner.kind === 'resource' && logsEnabled, refetchInterval: false, staleTime: Infinity },
  );
  const globalLogs = useGetGlobalFlowLogs(
    { path: { flowId: flowIdOf(owner) } },
    [{ flowId: flowIdOf(owner) }, recording?.startedAt],
    { enabled: owner.kind === 'global' && logsEnabled, refetchInterval: false, staleTime: Infinity },
  );
  const logs = (owner.kind === 'resource' ? resourceLogs.data : globalLogs.data)?.logs;

  // Only the status needs invalidating: starting changes startedAt, which is part of the
  // logs query key, and stopping disables that query altogether.
  const invalidateStatus = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: [owner.kind === 'resource' ? useGetFlowLogRecordingStatusKey : useGetGlobalFlowLogRecordingStatusKey],
      }),
    [owner, queryClient],
  );

  const resourceStart = useStartFlowLogRecording(undefined, { onSuccess: invalidateStatus });
  const resourceStop = useStopFlowLogRecording(undefined, { onSuccess: invalidateStatus });
  const globalStart = useStartGlobalFlowLogRecording(undefined, { onSuccess: invalidateStatus });
  const globalStop = useStopGlobalFlowLogRecording(undefined, { onSuccess: invalidateStatus });

  const startRecording = useCallback(
    (durationMinutes: number) => {
      const requestBody = { durationMinutes };
      if (owner.kind === 'resource')
        resourceStart.mutate({ path: { resourceId: owner.resourceId }, body: requestBody });
      else globalStart.mutate({ path: { flowId: owner.flowId }, body: requestBody });
    },
    [owner, resourceStart, globalStart],
  );
  const stopRecording = useCallback(() => {
    if (owner.kind === 'resource') resourceStop.mutate({ path: { resourceId: owner.resourceId } });
    else globalStop.mutate({ path: { flowId: owner.flowId } });
  }, [owner, resourceStop, globalStop]);

  return {
    recording,
    isRecording,
    logs,
    startRecording,
    stopRecording,
    isStarting: owner.kind === 'resource' ? resourceStart.isPending : globalStart.isPending,
    isStopping: owner.kind === 'resource' ? resourceStop.isPending : globalStop.isPending,
  };
}
