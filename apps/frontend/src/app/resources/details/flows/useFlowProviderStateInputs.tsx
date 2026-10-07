import { useCallback, useMemo, useState, useRef } from 'react';
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
} from '@xyflow/react';
import { ResourceFlowLog, useResourceFlowsServiceGetNodeSchemas } from '@attraccess/react-query-client';
import { useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';
import { useLiveLogs } from './liveLogs';
import { AttraccessNode } from './node';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import nodesDeTranslations from './node/de.json';
import nodesEnTranslations from './node/en.json';
import { LiveLogReceiver } from './flowContext.contracts';
import { FlowProviderProps } from './flowContext.contracts';

export function useFlowProviderStateInputs({ children, resourceId }: FlowProviderProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [validationErrors, setValidationErrorsState] = useState<Record<string, string>>({});
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
    resourceId,
  } as const;
}
