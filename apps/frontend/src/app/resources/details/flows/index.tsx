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
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ResourceFlowEdgeDto,
  ResourceFlowNodeDto,
  useResourceFlowsServiceGetResourceFlow,
  UseResourceFlowsServiceGetResourceFlowKeyFn,
  useResourceFlowsServiceSaveResourceFlow,
  useResourcesServiceGetOneResourceById,
} from '@attraccess/react-query-client';
import { useCallback, useEffect, useMemo } from 'react';
import { useTheme } from '@heroui/use-theme';
import { usePtrStore } from '../../../../stores/ptr.store';
import Dagre from '@dagrejs/dagre';
import { Button } from '@heroui/react';
import { CheckIcon, LayoutGridIcon, LogsIcon, PlusIcon, SaveIcon } from 'lucide-react';
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
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setNodes, setEdges, addNode } = useFlowContext();

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

    const fullNodeToSimpleNodeString = (node: ResourceFlowNodeDto | Node) => {
      return JSON.stringify({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
      });
    };

    const simpleDbNodesString = originalNodes.map(fullNodeToSimpleNodeString);
    const simpleFlowNodesString = nodes.map(fullNodeToSimpleNodeString);

    return simpleDbNodesString.some((node) => !simpleFlowNodesString.includes(node));
  }, [nodes, originalFlowData?.nodes]);

  const edgesHaveChanged = useMemo(() => {
    const originalEdges = originalFlowData?.edges ?? [];

    if (originalEdges.length !== edges.length) {
      return true;
    }

    const fullEdgeToSimpleEdgeString = (edge: ResourceFlowEdgeDto | Edge) => {
      return JSON.stringify({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      });
    };

    const simpleDbEdgesString = originalEdges.map(fullEdgeToSimpleEdgeString);
    const simpleFlowEdgesString = edges.map(fullEdgeToSimpleEdgeString);

    return simpleDbEdgesString.some((edge) => !simpleFlowEdgesString.includes(edge));
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
    const layouted = getLayoutedElements(nodes, edges, { direction: 'TB' });
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

  const { onReconnectStart, onReconnect, onReconnectEnd } = useRemoveEdgeOnDrop();
  const snapConnect = useSnapConnect();
  const nodeEdgeIntersectionSnapConnect = useNodeEdgeIntersectionSnapConnect();

  const onNodeDrag: OnNodeDrag = useCallback(
    (...params) => {
      snapConnect.onNodeDrag(...params);
      nodeEdgeIntersectionSnapConnect.onNodeDrag(...params);
    },
    [snapConnect, nodeEdgeIntersectionSnapConnect]
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (...params) => {
      snapConnect.onNodeDragStop(...params);
      nodeEdgeIntersectionSnapConnect.onNodeDragStop(...params);
    },
    [snapConnect, nodeEdgeIntersectionSnapConnect]
  );

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
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          colorMode={theme === 'dark' ? 'dark' : 'light'}
          fitView
          nodeTypes={flowNodeTypes}
          defaultEdgeOptions={{ animated: true, style: { strokeWidth: 4 } }}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onReconnectStart={onReconnectStart}
          onReconnect={onReconnect}
          onReconnectEnd={onReconnectEnd}
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
  return (
    <FlowProvider>
      <FlowsPageInner />
    </FlowProvider>
  );
}
