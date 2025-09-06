import React, { createContext, useContext, useCallback, ReactNode, useMemo, useState, useRef, useEffect } from 'react';
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
} from '@xyflow/react';
import { ResourceFlowLog } from '@attraccess/react-query-client';
import { getBaseUrl } from '../../../../api';
import { events } from 'fetch-event-stream';
import { useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';

export type LiveLogReceiver = (log: ResourceFlowLog) => void;

interface FlowContextType {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange<Node>;
  onEdgesChange: OnEdgesChange<Edge>;
  onConnect: (params: Edge | Connection) => void;
  updateNodeData: (nodeId: string, data: object) => void;
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

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nodes) => applyNodeChanges(changes, nodes));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((edges) => applyEdgeChanges(changes, edges));
  }, []);

  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds: Edge[]) => addEdge(params, eds)),
    [setEdges]
  );

  const updateNodeData = useCallback(
    (nodeId: string, data: object) => {
      setNodes((nodes) =>
        nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node))
      );
    },
    [setNodes]
  );

  const addNode = useCallback(
    (node: Node) => {
      setNodes((nodes) => [...nodes, node]);
    },
    [setNodes]
  );

  const removeNode = useCallback(
    (nodeId: string) => {
      setNodes((nodes) => nodes.filter((node) => node.id !== nodeId));
    },
    [setNodes]
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

  const [liveLogs, setLiveLogs] = useState<ResourceFlowLog[]>([]);
  const connectToLiveLogs = useCallback(async () => {
    const url = `${getBaseUrl()}/api/resources/${resourceId}/flow/logs/live`;

    const abortController = new AbortController();

    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include', // Include cookies for authentication
      signal: abortController.signal,
    });

    if (!res.ok) {
      throw new Error(`Failed to connect to SSE: ${res.status} ${res.statusText}`);
    }

    const stream = events(res, abortController.signal);

    for await (const event of stream) {
      try {
        const nextPacket = JSON.parse(event.data as string);

        if (nextPacket.keepalive) {
          continue;
        }

        setLiveLogs((prev) => [...prev, nextPacket]);

        publishLiveLog(nextPacket);
      } catch (parseError) {
        console.error('[FlowContext] Error parsing event data:', parseError, event);
      }
    }
  }, [publishLiveLog, resourceId]);

  useEffect(() => {
    connectToLiveLogs();
  }, [connectToLiveLogs]);

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
    ]
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
