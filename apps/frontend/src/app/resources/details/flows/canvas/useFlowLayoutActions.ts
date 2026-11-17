import { useCallback } from 'react';
import { Node, useReactFlow } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { getLayoutedElements } from '../flowLayout';
import { useFlowContext } from '../context/index';

/** Toolbar actions that arrange the canvas: auto layout and adding a first node of a chosen type. */
export function useFlowLayoutActions() {
  const { nodes, edges, setNodes, setEdges, addNode } = useFlowContext();
  const { fitView, getInternalNode } = useReactFlow();

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

  return { layout, addStartNode };
}
