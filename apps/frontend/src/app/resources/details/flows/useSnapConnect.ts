import { useReactFlow, useStoreApi, Node, InternalNode, OnNodeDrag } from '@xyflow/react';
import { useCallback } from 'react';
import { useFlowContext } from './flowContext';

const MIN_DISTANCE = 150;
export function useSnapConnect(minDistance = MIN_DISTANCE) {
  const { setEdges } = useFlowContext();
  const store = useStoreApi();
  const { getInternalNode } = useReactFlow();

  const getClosestEdge = useCallback(
    (node: Node) => {
      const { nodeLookup } = store.getState();
      const internalNode = getInternalNode(node.id);

      if (!internalNode) {
        return null;
      }

      const closestNode: { distance: number; node: InternalNode<Node> | null } = Array.from(nodeLookup.values()).reduce(
        (res, n) => {
          if (n.id !== internalNode.id) {
            const dx = n.internals.positionAbsolute.x - internalNode.internals.positionAbsolute.x;
            const dy = n.internals.positionAbsolute.y - internalNode.internals.positionAbsolute.y;
            const d = Math.sqrt(dx * dx + dy * dy);

            if (d < res.distance && d < minDistance) {
              res.distance = d;
              (res as unknown as { node: Node }).node = n;
            }
          }

          return res;
        },
        {
          distance: Number.MAX_VALUE,
          node: null,
        }
      );

      if (!closestNode.node) {
        return null;
      }

      const closeNodeIsSource =
        closestNode.node?.internals.positionAbsolute.x < internalNode.internals.positionAbsolute.x;

      return {
        id: closeNodeIsSource ? `${closestNode.node.id}-${node.id}` : `${node.id}-${closestNode.node.id}`,
        source: closeNodeIsSource ? closestNode.node.id : node.id,
        target: closeNodeIsSource ? node.id : closestNode.node.id,
      };
    },
    [minDistance, store, getInternalNode]
  );

  const onNodeDrag: OnNodeDrag = useCallback(
    (_: unknown, node: Node) => {
      const closeEdge = getClosestEdge(node) as ReturnType<typeof getClosestEdge> & { className: string };

      setEdges((es) => {
        const nextEdges = es.filter((e) => e.className !== 'temp');

        if (closeEdge && !nextEdges.find((ne) => ne.source === closeEdge.source && ne.target === closeEdge.target)) {
          closeEdge.className = 'temp';
          nextEdges.push(closeEdge);
        }

        return nextEdges;
      });
    },
    [getClosestEdge, setEdges]
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_: unknown, node: Node) => {
      const closeEdge = getClosestEdge(node);

      setEdges((es) => {
        const nextEdges = es.filter((e) => e.className !== 'temp');

        if (closeEdge && !nextEdges.find((ne) => ne.source === closeEdge.source && ne.target === closeEdge.target)) {
          nextEdges.push(closeEdge);
        }

        return nextEdges;
      });
    },
    [getClosestEdge, setEdges]
  );

  return {
    onNodeDrag,
    onNodeDragStop,
  };
}
