import { useParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { Background, BackgroundVariant, Controls, Edge, Node, Panel, ReactFlow, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Dagre from '@dagrejs/dagre';
import { Button, Input, Spinner, Textarea } from '@heroui/react';
import { CheckIcon, LayoutGridIcon, PlusIcon, SaveIcon } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../components/pageHeader';
import { useToastMessage } from '../../components/toastProvider';
import { FlowProvider, useFlowContext } from '../resources/details/flows/flowContext';
import { EdgeWithDeleteButton } from '../resources/details/flows/edgeWithDeleteButton';
import { ResourceFlowEdgeDto, ResourceFlowNodeDto } from '@attraccess/react-query-client';
import { SubFlowNodePickerModal } from './SubFlowNodePickerModal';
import {
  SubFlowDetail,
  SubFlowSavePayload,
  subFlowsQueryKey,
  updateSubFlow,
  useSubFlow,
  useSubFlowNodeSchemas,
} from './api';
import nodesDeTranslations from '../resources/details/flows/node/de.json';
import nodesEnTranslations from '../resources/details/flows/node/en.json';
import en from './en.json';
import de from './de.json';

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB' });

  edges.forEach((edge) => g.setEdge(edge.source, edge.target));
  nodes.forEach((node) =>
    g.setNode(node.id, {
      ...node,
      width: node.measured?.width ?? 0,
      height: node.measured?.height ?? 0,
    }),
  );

  Dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const position = g.node(node.id);
      const x = position.x - (node.measured?.width ?? 0) / 2;
      const y = position.y - (node.measured?.height ?? 0) / 2;
      return { ...node, position: { x, y } };
    }),
    edges,
  };
}

function areNodesEqual(node1: ResourceFlowNodeDto | Node, node2: ResourceFlowNodeDto | Node): boolean {
  return (
    node1.id === node2.id &&
    node1.type === node2.type &&
    node1.position.x === node2.position.x &&
    node1.position.y === node2.position.y &&
    JSON.stringify(node1.data) === JSON.stringify(node2.data)
  );
}

function areEdgesEqual(edge1: ResourceFlowEdgeDto | Edge, edge2: ResourceFlowEdgeDto | Edge): boolean {
  return edge1.id === edge2.id && edge1.source === edge2.source && edge1.target === edge2.target;
}

function SubFlowEditorInner() {
  const { subFlowId } = useParams();
  const numericId = Number(subFlowId);
  const { data: subFlow, isLoading } = useSubFlow(numericId);
  const { t } = useTranslations({ en, de });
  const { t: tNodeTranslations } = useTranslations({
    de: nodesDeTranslations,
    en: nodesEnTranslations,
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
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
    flowNodeTypes,
  } = useFlowContext();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!subFlow) {
      return;
    }
    setNodes(subFlow.nodes);
    setEdges(subFlow.edges);
    setName(subFlow.name);
    setDescription(subFlow.description ?? '');
  }, [subFlow, setNodes, setEdges]);

  const nodesHaveChanged = useMemo(() => {
    const originalNodes = subFlow?.nodes ?? [];
    if (originalNodes.length !== nodes.length) {
      return true;
    }
    for (let i = 0; i < originalNodes.length; i++) {
      const originalNode = originalNodes[i];
      const currentNode = nodes.find((n) => n.id === originalNode.id);
      if (!currentNode || !areNodesEqual(originalNode, currentNode)) {
        return true;
      }
    }
    return false;
  }, [nodes, subFlow?.nodes]);

  const edgesHaveChanged = useMemo(() => {
    const originalEdges = subFlow?.edges ?? [];
    if (originalEdges.length !== edges.length) {
      return true;
    }
    for (let i = 0; i < originalEdges.length; i++) {
      const originalEdge = originalEdges[i];
      const currentEdge = edges.find((e) => e.id === originalEdge.id);
      if (!currentEdge || !areEdgesEqual(originalEdge, currentEdge)) {
        return true;
      }
    }
    return false;
  }, [edges, subFlow?.edges]);

  const metadataChanged = useMemo(() => {
    return name !== (subFlow?.name ?? '') || description !== (subFlow?.description ?? '');
  }, [name, description, subFlow?.name, subFlow?.description]);

  const flowHasChanged = useMemo(() => nodesHaveChanged || edgesHaveChanged || metadataChanged, [
    nodesHaveChanged,
    edgesHaveChanged,
    metadataChanged,
  ]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!subFlow) {
        throw new Error('Sub-flow not loaded.');
      }

      const payload: SubFlowSavePayload = {
        name: name.trim(),
        description: description.trim().length > 0 ? description.trim() : null,
        nodes: nodes as ResourceFlowNodeDto[],
        edges: edges as ResourceFlowEdgeDto[],
      };

      return updateSubFlow(numericId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subFlowsQueryKey });
      queryClient.invalidateQueries({ queryKey: [...subFlowsQueryKey, numericId] });
    },
    onError: (error) => {
      toast.error({
        title: t('editor.saveError'),
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const save = useCallback(() => {
    if (!flowHasChanged || updateMutation.isPending) {
      return;
    }
    updateMutation.mutate();
  }, [flowHasChanged, updateMutation]);

  const layout = useCallback(() => {
    const layouted = getLayoutedElements(nodes, edges);
    setNodes([...layouted.nodes]);
    setEdges([...layouted.edges]);
    fitView();
  }, [nodes, edges, fitView, setNodes, setEdges]);

  const addStartNode = useCallback(
    (nodeType: string) => {
      let maxX = 0;
      nodes.forEach((node) => {
        maxX = Math.max(maxX, node.position.x);
      });
      const newNode: Node = {
        id: nanoid(),
        position: { x: maxX + 300, y: 0 },
        type: nodeType,
        data: {},
      };
      addNode(newNode);
      fitView({ nodes: [newNode], duration: 1000, maxZoom: 0.9 });
    },
    [addNode, nodes, fitView],
  );

  const edgeTypes = useMemo(
    () => ({
      'attraccess-edge': EdgeWithDeleteButton,
    }),
    [],
  );

  const edgesWithCorrectType = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        type: edge.type ?? 'attraccess-edge',
      })),
    [edges],
  );

  if (isLoading || !subFlow) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col gap-4">
      <PageHeader title={t('editor.title', { name })} subtitle={t('editor.subtitle')} backTo="/flows/subflows" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Input label={t('editor.name')} value={name} onValueChange={setName} />
        <Textarea label={t('editor.description')} value={description} onValueChange={setDescription} />
      </div>

      <div className="w-full h-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edgesWithCorrectType}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          defaultEdgeOptions={{ style: { strokeWidth: 4 } }}
          nodeTypes={flowNodeTypes}
          edgeTypes={edgeTypes}
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          <Panel position="top-right" className="flex flex-row flex-wrap gap-2">
            <Button
              isIconOnly
              isLoading={updateMutation.isPending}
              startContent={updateMutation.isSuccess && !flowHasChanged ? <CheckIcon /> : <SaveIcon />}
              onPress={save}
              isDisabled={!flowHasChanged}
              color={updateMutation.isError ? 'danger' : flowHasChanged ? 'primary' : 'default'}
            />
            <Button isIconOnly startContent={<LayoutGridIcon />} onPress={layout} />
            <SubFlowNodePickerModal tNodeTranslations={tNodeTranslations} onSelect={addStartNode}>
              {(open) => <Button color="primary" isIconOnly startContent={<PlusIcon />} onPress={open} />}
            </SubFlowNodePickerModal>
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}

export default function SubFlowEditorPage() {
  const { data: nodeSchemas } = useSubFlowNodeSchemas();

  return (
    <FlowProvider mode="subflow" nodeSchemas={nodeSchemas}>
      <SubFlowEditorInner />
    </FlowProvider>
  );
}
