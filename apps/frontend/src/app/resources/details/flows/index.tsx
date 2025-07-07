import { PageHeader } from '../../../../components/pageHeader';
import { useParams } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  Node,
  Panel,
  Edge,
  useReactFlow,
  NodeTypes,
  OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ResourceFlowEdgeDto,
  ResourceFlowLog,
  ResourceFlowNodeDto,
  useResourceFlowsServiceGetResourceFlow,
  UseResourceFlowsServiceGetResourceFlowKeyFn,
  useResourceFlowsServiceSaveResourceFlow,
  useResourcesServiceGetOneResourceById,
} from '@attraccess/react-query-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@heroui/use-theme';
import { usePtrStore } from '../../../../stores/ptr.store';
import Dagre from '@dagrejs/dagre';
import { Button } from '@heroui/react';
import { CheckIcon, LayoutGridIcon, PlusIcon, SaveIcon } from 'lucide-react';
import { nanoid } from 'nanoid';

import de from './de.json';
import en from './en.json';
import { AttraccessNodes } from './nodes';
import { NodePickerModal } from './nodePickerModal';
import { FlowProvider, useFlowContext } from './flowContext';
import { useQueryClient } from '@tanstack/react-query';
import { LogViewer } from './logViewer';
import { useSnapConnect } from './useSnapConnect';
import { useRemoveEdgeOnDrop } from './useRemoveEdgeOnDrop';
import { useNodeEdgeIntersectionSnapConnect } from './useNodeEdgeIntersectionSnapConnect';
import { EdgeWithDeleteButton } from './edgeWithDeleteButton';
import JSConfetti from 'js-confetti';

function getLayoutedElements(nodes: Node[], edges: Edge[], options: { direction: 'TB' | 'LR' }) {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: options.direction });

  edges.forEach((edge) => g.setEdge(edge.source, edge.target));
  nodes.forEach((node) =>
    g.setNode(node.id, {
      ...node,
      width: node.measured?.width ?? 0,
      height: node.measured?.height ?? 0,
    })
  );

  Dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const position = g.node(node.id);
      // We are shifting the dagre node position (anchor=center center) to the top left
      // so it matches the React Flow node anchor point (top left).
      const x = position.x - (node.measured?.width ?? 0) / 2;
      const y = position.y - (node.measured?.height ?? 0) / 2;

      return { ...node, position: { x, y } };
    }),
    edges,
  };
}

// Efficient comparison functions to replace expensive JSON.stringify operations
function areNodesEqual(node1: ResourceFlowNodeDto | Node, node2: ResourceFlowNodeDto | Node): boolean {
  return (
    node1.id === node2.id &&
    node1.type === node2.type &&
    node1.position.x === node2.position.x &&
    node1.position.y === node2.position.y &&
    JSON.stringify(node1.data) === JSON.stringify(node2.data) // Only stringify the smaller data object
  );
}

function areEdgesEqual(edge1: ResourceFlowEdgeDto | Edge, edge2: ResourceFlowEdgeDto | Edge): boolean {
  return edge1.id === edge2.id && edge1.source === edge2.source && edge1.target === edge2.target;
}

// Memory monitoring and automatic degradation
function useMemoryMonitoring() {
  const [memoryPressure, setMemoryPressure] = useState<'low' | 'medium' | 'high'>('low');
  const lastMemoryCheck = useRef(0);

  const checkMemory = useCallback(() => {
    const now = Date.now();
    if (now - lastMemoryCheck.current < 2000) return; // Check every 2 seconds
    lastMemoryCheck.current = now;

    // Type assertion for performance.memory which is non-standard
    const perfMemory = (performance as any).memory;
    if (perfMemory) {
      const usedMB = perfMemory.usedJSHeapSize / 1024 / 1024;
      const limitMB = perfMemory.totalJSHeapSize / 1024 / 1024;
      const usage = usedMB / limitMB;

      if (usage > 0.8) {
        setMemoryPressure('high');
        console.warn('High memory pressure detected:', Math.round(usedMB) + 'MB');
      } else if (usage > 0.6) {
        setMemoryPressure('medium');
      } else {
        setMemoryPressure('low');
      }
    }
  }, []);

  // Check memory on every drag operation
  return { memoryPressure, checkMemory };
}

function FlowsPageInner() {
  const { id: resourceId } = useParams();
  const { theme } = useTheme();
  const { data: resource } = useResourcesServiceGetOneResourceById({ id: Number(resourceId) });
  const { t } = useTranslations('resources.details.flows', { de, en });
  const { setPullToRefreshIsEnabled } = usePtrStore();
  const queryClient = useQueryClient();
  const jsConfetti = useRef<JSConfetti>(new JSConfetti());

  useEffect(() => {
    setPullToRefreshIsEnabled(false);
    return () => {
      setPullToRefreshIsEnabled(true);
    };
  }, [setPullToRefreshIsEnabled]);

  const { data: originalFlowData } = useResourceFlowsServiceGetResourceFlow(
    { resourceId: Number(resourceId) },
    undefined,
    {
      enabled: !!resourceId,
    }
  );

  const {
    mutate: saveFlow,
    isSuccess: saveSucceeded,
    isPending: isSaving,
  } = useResourceFlowsServiceSaveResourceFlow({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: UseResourceFlowsServiceGetResourceFlowKeyFn({ resourceId: Number(resourceId) }),
      });
    },
  });

  const { fitView } = useReactFlow();
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setNodes,
    setEdges,
    addNode,
    addLiveLogReceiver,
    removeLiveLogReceiver,
  } = useFlowContext();

  useEffect(() => {
    if (originalFlowData) {
      setNodes(originalFlowData.nodes);
      setEdges(originalFlowData.edges);
    }
  }, [originalFlowData, setNodes, setEdges]);

  const nodesHaveChanged = useMemo(() => {
    const originalNodes = originalFlowData?.nodes ?? [];

    if (originalNodes.length !== nodes.length) {
      return true;
    }

    // More efficient comparison without JSON.stringify on entire arrays
    for (let i = 0; i < originalNodes.length; i++) {
      const originalNode = originalNodes[i];
      const currentNode = nodes.find((n) => n.id === originalNode.id);

      if (!currentNode || !areNodesEqual(originalNode, currentNode)) {
        return true;
      }
    }

    return false;
  }, [nodes, originalFlowData?.nodes]);

  const edgesHaveChanged = useMemo(() => {
    const originalEdges = originalFlowData?.edges ?? [];

    if (originalEdges.length !== edges.length) {
      return true;
    }

    // More efficient comparison without JSON.stringify on entire arrays
    for (let i = 0; i < originalEdges.length; i++) {
      const originalEdge = originalEdges[i];
      const currentEdge = edges.find((e) => e.id === originalEdge.id);

      if (!currentEdge || !areEdgesEqual(originalEdge, currentEdge)) {
        return true;
      }
    }

    return false;
  }, [edges, originalFlowData?.edges]);

  const flowHasChanged = useMemo(() => {
    return nodesHaveChanged || edgesHaveChanged;
  }, [nodesHaveChanged, edgesHaveChanged]);

  // Memoize the save callback with stable dependencies
  const save = useCallback(() => {
    saveFlow({
      resourceId: Number(resourceId),
      requestBody: {
        nodes: nodes as ResourceFlowNodeDto[],
        edges: edges as ResourceFlowEdgeDto[],
      },
    });
  }, [nodes, edges, saveFlow, resourceId]);

  // Memoize layout callback with stable dependencies
  const layout = useCallback(() => {
    const layouted = getLayoutedElements(nodes, edges, { direction: 'TB' });
    setNodes([...layouted.nodes]);
    setEdges([...layouted.edges]);
    fitView();
  }, [nodes, edges, fitView, setNodes, setEdges]);

  // Memoize addStartNode with stable dependency
  const addStartNode = useCallback(
    (nodeType: string) => {
      const newNode: Node = {
        id: nanoid(),
        position: { x: 0, y: 0 },
        type: nodeType,
        data: {},
      };
      addNode(newNode);
    },
    [addNode]
  );

  // Cache flow node types - this should rarely change
  const flowNodeTypes = useMemo(() => {
    const types: NodeTypes = {};
    Object.entries(AttraccessNodes).forEach(([key, value]) => {
      types[key] = value.component;
    });
    return types;
  }, []); // Empty dependency array since AttraccessNodes is static

  // Enhanced Safari and memory detection
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const { memoryPressure, checkMemory } = useMemoryMonitoring();

  // Progressive feature enablement based on memory pressure
  const shouldEnableSnapConnect = !isSafari && memoryPressure === 'low';
  const shouldEnableEdgeIntersection = !isSafari && memoryPressure !== 'high';

  // Create hooks but only use them conditionally
  const removeEdgeOnDropHooks = useRemoveEdgeOnDrop();
  const snapConnectHooks = useSnapConnect();
  const nodeEdgeIntersectionSnapConnectHooks = useNodeEdgeIntersectionSnapConnect();

  // Aggressive throttling for drag operations
  const dragThrottle = useRef(0);
  const AGGRESSIVE_THROTTLE = isSafari ? 100 : memoryPressure === 'high' ? 50 : 32;

  // Memory-aware drag callbacks with progressive degradation
  const onNodeDrag: OnNodeDrag = useCallback(
    (...params) => {
      const now = Date.now();

      // More aggressive throttling based on memory pressure
      if (now - dragThrottle.current < AGGRESSIVE_THROTTLE) {
        return;
      }
      dragThrottle.current = now;

      // Check memory periodically during drag
      checkMemory();

      // Progressive feature degradation
      if (shouldEnableSnapConnect) {
        snapConnectHooks.onNodeDrag(...params);
      }

      if (shouldEnableEdgeIntersection) {
        nodeEdgeIntersectionSnapConnectHooks.onNodeDrag(...params);
      }
    },
    [
      shouldEnableSnapConnect,
      shouldEnableEdgeIntersection,
      checkMemory,
      AGGRESSIVE_THROTTLE,
      snapConnectHooks,
      nodeEdgeIntersectionSnapConnectHooks,
    ]
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (...params) => {
      // Always allow drag stop for consistency
      if (shouldEnableSnapConnect) {
        snapConnectHooks.onNodeDragStop(...params);
      }

      if (shouldEnableEdgeIntersection) {
        nodeEdgeIntersectionSnapConnectHooks.onNodeDragStop(...params);
      }

      // Force garbage collection hint for Safari
      if (isSafari && window.gc) {
        window.gc();
      }
    },
    [
      shouldEnableSnapConnect,
      shouldEnableEdgeIntersection,
      isSafari,
      nodeEdgeIntersectionSnapConnectHooks,
      snapConnectHooks,
    ]
  );

  const [flowIsRunning, setFlowIsRunning] = useState(false);
  const [flowExecutionHadError, setFlowExecutionHadError] = useState(false);

  // Memory-aware live log callback
  const onLiveLog = useCallback(
    (log: ResourceFlowLog) => {
      if (log.type === 'node.processing.failed') {
        setFlowExecutionHadError(true);
      }

      if (log.type === 'flow.start') {
        setFlowIsRunning(true);
      }

      if (log.type === 'flow.completed') {
        setFlowIsRunning(false);
        setFlowExecutionHadError(false);

        if (!flowExecutionHadError) {
          jsConfetti.current.addConfetti();
        }
      }
    },
    [flowExecutionHadError]
  );

  useEffect(() => {
    addLiveLogReceiver(onLiveLog);
    return () => {
      removeLiveLogReceiver(onLiveLog);
    };
  }, [addLiveLogReceiver, removeLiveLogReceiver, onLiveLog]);

  // Memory-aware edges with conditional animations
  const edgesWithCorrectType = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      type: edge.type ?? 'attraccess-edge',
      animated: flowIsRunning,
    }));
  }, [edges, flowIsRunning]);

  // Status message based on active optimizations
  const getStatusMessage = () => {
    if (isSafari) {
      return `Safari compatibility mode (Memory: ${memoryPressure})`;
    }
    if (memoryPressure === 'high') {
      return 'High memory usage - some features disabled';
    }
    if (memoryPressure === 'medium') {
      return 'Medium memory usage - reduced features';
    }
    return null;
  };

  const statusMessage = getStatusMessage();

  return (
    <div className="h-full w-full flex flex-col">
      <PageHeader
        title={t('title', { resourceName: resource?.name })}
        subtitle={t('subtitle')}
        backTo={`/resources/${resourceId}`}
      />

      {statusMessage && (
        <div
          className={`p-2 text-sm ${
            memoryPressure === 'high'
              ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
              : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
          }`}
        >
          {statusMessage}
          {memoryPressure !== 'low' && (
            <span className="ml-2">
              Features: Snap={shouldEnableSnapConnect ? '✓' : '✗'}
              Intersect={shouldEnableEdgeIntersection ? '✓' : '✗'}
            </span>
          )}
        </div>
      )}

      <div className="w-full h-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
        <ReactFlow
          nodes={nodes}
          edges={edgesWithCorrectType}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          colorMode={theme === 'dark' ? 'dark' : 'light'}
          fitView
          nodeTypes={flowNodeTypes}
          defaultEdgeOptions={{ style: { strokeWidth: 4 } }}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          // Progressive reconnect feature enablement
          onReconnectStart={shouldEnableEdgeIntersection ? removeEdgeOnDropHooks.onReconnectStart : undefined}
          onReconnect={shouldEnableEdgeIntersection ? removeEdgeOnDropHooks.onReconnect : undefined}
          onReconnectEnd={shouldEnableEdgeIntersection ? removeEdgeOnDropHooks.onReconnectEnd : undefined}
          edgeTypes={{
            'attraccess-edge': EdgeWithDeleteButton,
          }}
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />

          <Panel position="top-right" className="flex flex-row flex-wrap gap-2">
            <Button
              isIconOnly
              isLoading={isSaving}
              startContent={saveSucceeded && !flowHasChanged ? <CheckIcon /> : <SaveIcon />}
              onPress={save}
              isDisabled={!flowHasChanged}
            />
            {/*<LogViewer resourceId={Number(resourceId)}>
              {(open) => <Button isIconOnly startContent={<LogsIcon />} onPress={open} />}
            </LogViewer>*/}
            <Button isIconOnly startContent={<LayoutGridIcon />} onPress={layout} />
            <NodePickerModal onSelect={addStartNode}>
              {(open) => <Button color="primary" isIconOnly startContent={<PlusIcon />} onPress={open} />}
            </NodePickerModal>
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}

export default function FlowsPage() {
  const { id: resourceId } = useParams();

  return (
    <FlowProvider resourceId={Number(resourceId)}>
      <FlowsPageInner />
    </FlowProvider>
  );
}
