import { useCallback, useMemo, useState, useRef, ReactNode } from 'react';
import { nanoid } from 'nanoid';
import { buildClipboardData, parseClipboardData, buildPastedElements } from '../flowClipboard';
import {
  Node,
  Edge,
  addEdge,
  Connection,
  EdgeChange,
  NodeChange,
  applyNodeChanges,
  applyEdgeChanges,
  NodeTypes,
} from '@xyflow/react';
import { ResourceFlowLog, useGetOneResourceById } from '@attraccess/react-query-client';
import { FlowOwner, useFlowNodeSchemasQuery } from '../flowOwner';
import type { NodeValidationError } from '../node/validationMessages';
import { FlowCanvasNode } from '../node/FlowCanvasNode';
import { FlowContext, type FlowContextType, type LiveLogReceiver } from './flowContext';
import { groupValidationErrorsByNode } from './groupValidationErrorsByNode';
import { FlowLogsProvider } from './FlowLogsProvider';

export interface FlowProviderProps {
  children: ReactNode;
  owner: FlowOwner;
}

export function FlowProvider({ children, owner }: Readonly<FlowProviderProps>) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [validationErrors, setValidationErrorsState] = useState<Record<string, NodeValidationError[]>>({});
  const { data: resource } = useGetOneResourceById(
    { path: { id: owner.kind === 'resource' ? owner.resourceId : 0 } },
    undefined,
    { enabled: owner.kind === 'resource' },
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nodes) => applyNodeChanges(changes, nodes));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((edges) => applyEdgeChanges(changes, edges));
  }, []);

  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds: Edge[]) => addEdge(params, eds)),
    [setEdges],
  );

  const updateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nodes) => nodes.map((node) => (node.id === nodeId ? { ...node, data } : node)));
    },
    [setNodes],
  );

  const addNode = useCallback(
    (node: Node) => {
      setNodes((nodes) => [...nodes, node]);
    },
    [setNodes],
  );

  const removeNode = useCallback(
    (nodeId: string) => {
      setNodes((nodes) => nodes.filter((node) => node.id !== nodeId));
      setEdges((edges) => edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    },
    [setNodes, setEdges],
  );

  const setValidationErrors = useCallback((errors: ReadonlyArray<NodeValidationError & { nodeId: string }>) => {
    setValidationErrorsState(groupValidationErrorsByNode(errors));
  }, []);

  const liveLogReceivers = useRef<LiveLogReceiver[]>([]);

  const publishLiveLog = useCallback((log: ResourceFlowLog) => {
    liveLogReceivers.current.forEach((receiver, index) => {
      try {
        receiver(log);
      } catch (error) {
        console.error(`[FlowContext] Error in live log receiver ${index}:`, error);
      }
    });
  }, []);

  const addLiveLogReceiver = useCallback((receiver: LiveLogReceiver) => {
    liveLogReceivers.current.push(receiver);
  }, []);

  const removeLiveLogReceiver = useCallback((receiver: LiveLogReceiver) => {
    liveLogReceivers.current = liveLogReceivers.current.filter((r) => r !== receiver);
  }, []);

  const { data: nodeSchemas } = useFlowNodeSchemasQuery(owner);
  const nodeSchemasByType = useMemo(
    () => new Map((nodeSchemas ?? []).map((schema) => [schema.type, schema])),
    [nodeSchemas],
  );
  // Keyed on the type names only: every key maps to the same component, so the object changes only when the set of
  // node types does.
  const nodeTypesKey = [...nodeSchemasByType.keys()].sort().join('\n');
  const flowNodeTypes = useMemo<NodeTypes>(
    () => Object.fromEntries((nodeTypesKey ? nodeTypesKey.split('\n') : []).map((type) => [type, FlowCanvasNode])),
    [nodeTypesKey],
  );

  const copySelectedNodes = useCallback(async () => {
    const clipboardData = buildClipboardData(nodes, edges);
    if (!clipboardData) return;
    await navigator.clipboard.writeText(JSON.stringify(clipboardData));
  }, [nodes, edges]);

  const cutSelectedNodes = useCallback(async () => {
    const clipboardData = buildClipboardData(nodes, edges);
    if (!clipboardData) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(clipboardData));
    } catch {
      return;
    }
    const removedIds = new Set(clipboardData.nodes.map((n) => n.id));
    setNodes((prev) => prev.filter((n) => !removedIds.has(n.id)));
    setEdges((prev) => prev.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target)));
  }, [nodes, edges, setNodes, setEdges]);

  const pasteNodes = useCallback(
    async (targetFlowPosition?: { x: number; y: number }) => {
      const text = await navigator.clipboard.readText().catch(() => '');
      const clipboardData = parseClipboardData(text);
      if (!clipboardData) return;

      const { nodes: newNodes, edges: newEdges } = buildPastedElements(clipboardData, nanoid, 50, targetFlowPosition);
      setNodes((prev) => [...prev.map((n) => ({ ...n, selected: false })), ...newNodes]);
      setEdges((prev) => [...prev, ...newEdges]);
    },
    [setNodes, setEdges],
  );

  const value: FlowContextType = useMemo(
    () => ({
      nodes: nodes,
      edges: edges,
      onNodesChange: onNodesChange,
      onEdgesChange: onEdgesChange,
      onConnect: onConnect,
      updateNodeData: updateNodeData,
      addNode: addNode,
      removeNode: removeNode,
      setNodes: setNodes,
      setEdges: setEdges,
      owner,
      resourceId: owner.kind === 'resource' ? owner.resourceId : undefined,
      resourceType: (resource?.type as 'machine' | 'door') ?? 'machine',
      resourceSeparateUnlockAndUnlatch: Boolean(resource?.separateUnlockAndUnlatch),
      resourceAllowTakeOver: Boolean(resource?.allowTakeOver),
      addLiveLogReceiver: addLiveLogReceiver,
      removeLiveLogReceiver: removeLiveLogReceiver,
      flowNodeTypes: flowNodeTypes,
      nodeSchemasByType,
      copySelectedNodes,
      cutSelectedNodes,
      pasteNodes,
      validationErrors: validationErrors,
      setValidationErrors: setValidationErrors,
    }),
    [
      nodes,
      edges,
      onNodesChange,
      onEdgesChange,
      onConnect,
      updateNodeData,
      addNode,
      removeNode,
      setNodes,
      setEdges,
      owner,
      resource?.type,
      resource?.separateUnlockAndUnlatch,
      resource?.allowTakeOver,
      addLiveLogReceiver,
      removeLiveLogReceiver,
      flowNodeTypes,
      nodeSchemasByType,
      copySelectedNodes,
      cutSelectedNodes,
      pasteNodes,
      validationErrors,
      setValidationErrors,
    ],
  );

  return (
    <FlowContext.Provider value={value}>
      <FlowLogsProvider owner={owner} onLog={publishLiveLog}>
        {children}
      </FlowLogsProvider>
    </FlowContext.Provider>
  );
}

export { FlowContext, useFlowContext, type FlowContextType, type LiveLogReceiver } from './flowContext';
export { useFlowLogsContext, type FlowLogsContextType } from './flowLogsContext';
