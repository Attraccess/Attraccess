import React, { createContext, useContext, useCallback, ReactNode, useMemo, useState, useRef } from 'react';
import {
  Node,
  Edge,
  addEdge,
  Connection,
  OnNodesChange,
  OnEdgesChange,
  EdgeChange,
  NodeChange,
  applyNodeChanges,
  applyEdgeChanges,
  NodeTypes,
  NodeProps,
} from '@xyflow/react';
import { nanoid } from 'nanoid';
import { ResourceFlowLog, useResourceFlowsServiceGetNodeSchemas } from '@attraccess/react-query-client';
import { useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';
import { useLiveLogs } from './liveLogs';
import { AttraccessNode } from './node';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import nodesDeTranslations from './node/de.json';
import nodesEnTranslations from './node/en.json';
import { buildClipboardData, parseClipboardData, buildPastedElements } from './flowClipboard';

export type LiveLogReceiver = (log: ResourceFlowLog) => void;

interface FlowContextType {
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
  resourceId: number;
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
}

const FlowContext = createContext<FlowContextType | undefined>(undefined);

interface FlowProviderProps {
  children: ReactNode;
  resourceId: number;
}

export function FlowProvider({ children, resourceId }: FlowProviderProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });

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
      setNodes((nodes) =>
        nodes.map((node) => (node.id === nodeId ? { ...node, data } : node)),
      );
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
    resourceId,
    onUpdate: publishLiveLog,
  });

  const { data: nodeSchemas } = useResourceFlowsServiceGetNodeSchemas({ resourceId });
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
        />
      );
    });

    return types;
  }, [nodeSchemas, tNodeTranslations, tNodeExists]);

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
      resourceId,
      resourceType: (resource?.type as 'machine' | 'door') ?? 'machine',
      resourceSeparateUnlockAndUnlatch: Boolean(resource?.separateUnlockAndUnlatch),
      resourceAllowTakeOver: Boolean(resource?.allowTakeOver),
      liveLogs: liveLogs ?? [],
      addLiveLogReceiver,
      removeLiveLogReceiver,
      flowNodeTypes,
      copySelectedNodes,
      cutSelectedNodes,
      pasteNodes,
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
      resourceId,
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
    ],
  );

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlowContext(): FlowContextType {
  const context = useContext(FlowContext);
  if (context === undefined) {
    throw new Error('useFlowContext must be used within a FlowProvider');
  }
  return context;
}
