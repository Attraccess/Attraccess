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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '@heroui/use-theme';
import { usePtrStore } from '../../../../stores/ptr.store';
import Dagre from '@dagrejs/dagre';
import { Button } from '@heroui/react';
import { CheckIcon, LayoutGridIcon, LogsIcon, PlusIcon, SaveIcon } from 'lucide-react';
import { nanoid } from 'nanoid';
import { AttraccessNodes } from './nodes';
import { NodePickerModal } from './nodePickerModal';
import { FlowProvider, useFlowContext } from './flowContext';
import { useQueryClient } from '@tanstack/react-query';
import { EdgeWithDeleteButton } from './edgeWithDeleteButton';
import JSConfetti from 'js-confetti';
import { LogViewer } from './logViewer';

import de from './de.json';
import en from './en.json';

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB' });

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

const jsConfetti = new JSConfetti();

function FlowsPageInner() {
  const { id: resourceId } = useParams();
  const { theme } = useTheme();
  const { data: resource } = useResourcesServiceGetOneResourceById({ id: Number(resourceId) });
  const { t } = useTranslations('resources.details.flows', { de, en });
  const { setPullToRefreshIsEnabled } = usePtrStore();
  const queryClient = useQueryClient();

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

  const save = useCallback(() => {
    saveFlow({
      resourceId: Number(resourceId),
      requestBody: {
        nodes: nodes as ResourceFlowNodeDto[],
        edges: edges as ResourceFlowEdgeDto[],
      },
    });
  }, [nodes, edges, saveFlow, resourceId]);

  const layout = useCallback(() => {
    const layouted = getLayoutedElements(nodes, edges);
    setNodes([...layouted.nodes]);
    setEdges([...layouted.edges]);
    fitView();
  }, [nodes, edges, fitView, setNodes, setEdges]);

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

  const flowNodeTypes = useMemo(() => {
    const types: NodeTypes = {};
    Object.entries(AttraccessNodes).forEach(([key, value]) => {
      types[key] = value.component;
    });
    return types;
  }, []);

  const [flowIsRunning, setFlowIsRunning] = useState(false);
  const [, setFlowExecutionHadError] = useState(false);

  const onLiveLog = useCallback(
    (log: ResourceFlowLog) => {
      if (log.type === 'node.processing.failed') {
        setFlowExecutionHadError(true);
        return;
      }

      if (log.type === 'flow.start') {
        setFlowIsRunning(true);
        return;
      }

      if (log.type === 'flow.completed') {
        setFlowIsRunning(false);

        // Use functional state update to get current error state
        setFlowExecutionHadError((currentErrorState) => {
          if (!currentErrorState) {
            jsConfetti.addConfetti();
          } else {
            jsConfetti.addConfetti({
              emojis: ['❌', '😢', '💔', '😭', '🚫', '⚠️', '💥', '👎'],
              emojiSize: 100,
              confettiNumber: 2,
            });
          }

          // Reset error state for next execution
          return false;
        });
      }
    },
    [setFlowIsRunning, setFlowExecutionHadError]
  );

  useEffect(() => {
    addLiveLogReceiver(onLiveLog);
    return () => {
      removeLiveLogReceiver(onLiveLog);
    };
  }, [addLiveLogReceiver, removeLiveLogReceiver, onLiveLog]);

  const edgesWithCorrectType = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      type: edge.type ?? 'attraccess-edge',
      animated: flowIsRunning,
    }));
  }, [edges, flowIsRunning]);

  return (
    <div className="h-full w-full flex flex-col">
      <PageHeader
        title={t('title', { resourceName: resource?.name })}
        subtitle={t('subtitle')}
        backTo={`/resources/${resourceId}`}
      />

      <div className="w-full h-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
        <ReactFlow
          nodes={nodes}
          edges={edgesWithCorrectType}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          colorMode={theme === 'dark' ? 'dark' : 'light'}
          fitView
          defaultEdgeOptions={{ style: { strokeWidth: 4 } }}
          nodeTypes={flowNodeTypes}
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
            <LogViewer resourceId={Number(resourceId)}>
              {(open) => <Button isIconOnly startContent={<LogsIcon />} onPress={open} />}
            </LogViewer>

            <Button isIconOnly startContent={<LayoutGridIcon />} onPress={layout} />
            <NodePickerModal
              onSelect={addStartNode}
              allowedNodeKeys={
                resource?.type === 'door'
                  ? Object.entries(AttraccessNodes)
                      .filter(([, v]) => !v.supportedResourceTypes || v.supportedResourceTypes.includes('door'))
                      .map(([k]) => k)
                      .filter((key) =>
                        resource?.separateUnlockAndUnlatch ? true : key !== 'input.resource.door.unlatched'
                      )
                  : Object.entries(AttraccessNodes)
                      .filter(([, v]) => !v.supportedResourceTypes || v.supportedResourceTypes.includes('machine'))
                      .map(([k]) => k)
                      .filter((key) => (resource?.allowTakeOver ? true : key !== 'input.resource.usage.takeover'))
              }
            >
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
