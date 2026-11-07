import React, { useCallback, useMemo, useState, useRef, useContext, createContext, ReactNode } from 'react';
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
  NodeProps,
  OnNodesChange,
  OnEdgesChange,
} from '@xyflow/react';
import { ResourceFlowLog, useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';
import { useLiveLogs } from '../liveLogs';
import { FlowOwner, useFlowNodeSchemasQuery } from '../flowOwner';
import { AttraccessNode } from '../node/index';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import nodesDeTranslations from '../node/de.json';
import nodesEnTranslations from '../node/en.json';

export function useFlowProviderStateOutput(model: ReturnType<typeof useFlowProviderStateInputs>) {
  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    updateNodeData,
    addNode,
    removeNode,
    owner,
    resource,
    liveLogs,
    addLiveLogReceiver,
    removeLiveLogReceiver,
    flowNodeTypes,
    validationErrors,
    setValidationErrors,
  } = model;
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
      liveLogs: liveLogs ?? [],
      addLiveLogReceiver: addLiveLogReceiver,
      removeLiveLogReceiver: removeLiveLogReceiver,
      flowNodeTypes: flowNodeTypes,
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
      liveLogs,
      addLiveLogReceiver,
      removeLiveLogReceiver,
      flowNodeTypes,
      copySelectedNodes,
      cutSelectedNodes,
      pasteNodes,
      validationErrors,
      setValidationErrors,
    ],
  );
  return { value, children: model.children } as const;
}

export function useFlowProviderState({ children, owner }: FlowProviderProps) {
  const useFlowProviderStateInputsModel = useFlowProviderStateInputs({ children, owner });
  return useFlowProviderStateOutput(useFlowProviderStateInputsModel);
}

export function useFlowProviderStateInputs({ children, owner }: FlowProviderProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [validationErrors, setValidationErrorsState] = useState<Record<string, string>>({});
  const { data: resource } = useResourcesServiceGetOneResourceById(
    { id: owner.kind === 'resource' ? owner.resourceId : 0 },
    undefined,
    { enabled: owner.kind === 'resource' },
  );

  const { t: tNodeTranslations, tExists: tNodeExists } = useTranslations({
    de: nodesDeTranslations,
    en: nodesEnTranslations,
  });

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
    },
    [setNodes],
  );

  const setValidationErrors = useCallback((errors: Array<{ nodeId: string; message: string }>) => {
    setValidationErrorsState(
      errors.reduce<Record<string, string>>(
        (messages, error) => ({
          ...messages,
          [error.nodeId]: messages[error.nodeId] ? `${messages[error.nodeId]} ${error.message}` : error.message,
        }),
        {},
      ),
    );
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

  const { liveLogs } = useLiveLogs({
    owner,
    onUpdate: publishLiveLog,
  });

  const { data: nodeSchemas } = useFlowNodeSchemasQuery(owner);
  const flowNodeTypes = useMemo(() => {
    if (!nodeSchemas) {
      return {};
    }

    const types: NodeTypes = {};
    nodeSchemas.forEach((nodeSchema) => {
      types[nodeSchema.type] = (props: NodeProps) => (
        <AttraccessNode
          tNodeTranslations={tNodeTranslations}
          tNodeExists={tNodeExists}
          schema={nodeSchema}
          node={props}
          validationError={validationErrors[props.id]}
        />
      );
    });

    return types;
  }, [nodeSchemas, tNodeTranslations, tNodeExists, validationErrors]);
  return {
    nodes,
    setNodes,
    edges,
    setEdges,
    validationErrors,
    setValidationErrorsState,
    resource,
    tNodeTranslations,
    tNodeExists,
    onNodesChange,
    onEdgesChange,
    onConnect,
    updateNodeData,
    addNode,
    removeNode,
    setValidationErrors,
    liveLogReceivers,
    publishLiveLog,
    addLiveLogReceiver,
    removeLiveLogReceiver,
    liveLogs,
    nodeSchemas,
    flowNodeTypes,
    children,
    owner,
  } as const;
}

export type LiveLogReceiver = (log: ResourceFlowLog) => void;

export interface FlowContextType {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange<Node>;
  onEdgesChange: OnEdgesChange<Edge>;
  onConnect: (params: Edge | Connection) => void;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  addNode: (node: Node) => void;
  removeNode: (nodeId: string) => void;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  owner: FlowOwner;
  /** Only set for resource flows. */
  resourceId: number | undefined;
  resourceType: 'machine' | 'door';
  resourceSeparateUnlockAndUnlatch: boolean;
  resourceAllowTakeOver: boolean;
  liveLogs: ResourceFlowLog[];
  addLiveLogReceiver: (receiver: LiveLogReceiver) => void;
  removeLiveLogReceiver: (receiver: LiveLogReceiver) => void;
  flowNodeTypes: NodeTypes;
  copySelectedNodes: () => Promise<void>;
  cutSelectedNodes: () => Promise<void>;
  pasteNodes: (targetFlowPosition?: { x: number; y: number }) => Promise<void>;
  validationErrors: Record<string, string>;
  setValidationErrors: (errors: Array<{ nodeId: string; message: string }>) => void;
}

export interface FlowProviderProps {
  children: ReactNode;
  owner: FlowOwner;
}

export const FlowContext = createContext<FlowContextType | undefined>(undefined);

export function useFlowContext(): FlowContextType {
  const context = useContext(FlowContext);
  if (context === undefined) {
    throw new Error('useFlowContext must be used within a FlowProvider');
  }
  return context;
}

export function FlowProvider({ children, owner }: FlowProviderProps) {
  const { value } = useFlowProviderState({ children, owner });

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}
