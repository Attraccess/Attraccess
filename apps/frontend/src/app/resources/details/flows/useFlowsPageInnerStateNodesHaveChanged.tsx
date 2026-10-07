import { Node } from '@xyflow/react';
import { ResourceFlowEdgeDto, ResourceFlowNodeDto } from '@attraccess/react-query-client';
import { useCallback, useMemo } from 'react';
import { getLayoutedElements } from './flowLayout';
import { nanoid } from 'nanoid';
import { areNodesEqual } from './index.helpers';
import { areEdgesEqual } from './index.helpers';
import type { useFlowsPageInnerStateInputs } from './useFlowsPageInnerStateInputs';

export function useFlowsPageInnerStateNodesHaveChanged(model: ReturnType<typeof useFlowsPageInnerStateInputs>) {
  const {
    originalFlowData,
    nodes,
    edges,
    saveFlow,
    resourceId,
    getInternalNode,
    setNodes,
    setEdges,
    fitView,
    addNode,
  } = model;
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
    const sourceHandles = new Map(
      nodes.map((node) => [
        node.id,
        [...(getInternalNode(node.id)?.internals.handleBounds?.source ?? [])]
          .sort((a, b) => a.x - b.x)
          .flatMap((handle) => (handle.id == null ? [] : [handle.id])),
      ]),
    );
    const layouted = getLayoutedElements(nodes, edges, sourceHandles);
    setNodes([...layouted.nodes]);
    setEdges([...layouted.edges]);
    fitView();
  }, [nodes, edges, fitView, setNodes, setEdges, getInternalNode]);

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

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);
  return {
    ...model,
    nodesHaveChanged,
    edgesHaveChanged,
    flowHasChanged,
    save,
    layout,
    addStartNode,
    onDragOver,
  } as const;
}
