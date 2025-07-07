import React, { createContext, useContext, useCallback, ReactNode, useMemo, useState, useRef, useEffect } from 'react';
import {
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  OnNodesChange,
  OnEdgesChange,
} from '@xyflow/react';
import { ResourceFlowLog } from '@attraccess/react-query-client';
import { useAuth } from '../../../../hooks/useAuth';
import { getBaseUrl } from '../../../../api';
import { useSSEQuery } from '../../../../api/useSSEQuery';

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
  liveLogs: ResourceFlowLog[];
  addLiveLogReceiver: (receiver: (log: ResourceFlowLog) => void) => void;
  removeLiveLogReceiver: (receiver: (log: ResourceFlowLog) => void) => void;
}

const FlowContext = createContext<FlowContextType | undefined>(undefined);

interface FlowProviderProps {
  children: ReactNode;
  resourceId: number;
}

export function FlowProvider({ children, resourceId }: FlowProviderProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

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

  const { token: authToken } = useAuth();
  const liveLogsRequestInit = useMemo(
    () => ({
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    }),
    [authToken]
  );

  // Use a Set for better performance when managing receivers
  const liveLogReceivers = useRef<Set<(log: ResourceFlowLog) => void>>(new Set());

  // Optimized publish function with error handling
  const publishLiveLog = useCallback((log: ResourceFlowLog) => {
    // Use a try-catch to prevent one bad receiver from breaking others
    liveLogReceivers.current.forEach((receiver) => {
      try {
        receiver(log);
      } catch (error) {
        console.error('Error in live log receiver:', error);
      }
    });
  }, []);

  const addLiveLogReceiver = useCallback((receiver: (log: ResourceFlowLog) => void) => {
    liveLogReceivers.current.add(receiver);
  }, []);

  const removeLiveLogReceiver = useCallback((receiver: (log: ResourceFlowLog) => void) => {
    liveLogReceivers.current.delete(receiver);
  }, []);

  // Clean up receivers when component unmounts
  useEffect(() => {
    return () => {
      liveLogReceivers.current.clear();
    };
  }, []);

  const { data: liveLogs } = useSSEQuery({
    queryKey: ['resource-flow-logs', resourceId],
    url: `${getBaseUrl()}/api/resources/${resourceId}/flow/logs/live`,
    init: liveLogsRequestInit,
    onData: publishLiveLog,
    queryOptions: {
      enabled: !!authToken,
    },
  });

  // Memoize the context value to prevent unnecessary re-renders
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
