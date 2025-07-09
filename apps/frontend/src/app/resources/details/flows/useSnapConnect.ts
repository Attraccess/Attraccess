import { useReactFlow, useStoreApi, Node, InternalNode, OnNodeDrag, Connection } from '@xyflow/react';
import { useCallback, useRef } from 'react';
import { useFlowContext } from './flowContext';

const MIN_DISTANCE = 150;
const THROTTLE_MS = 16; // ~60fps

export function useSnapConnect(minDistance = MIN_DISTANCE) {
  const { setEdges, onConnect } = useFlowContext();
  const store = useStoreApi();
  const { getInternalNode } = useReactFlow();
  const lastCalculationTime = useRef(0);
  const lastClosestConnection = useRef<Connection | null>(null);

  const getClosestConnection = useCallback(
    (node: Node): Connection | null => {
      const { nodeLookup } = store.getState();
      const internalNode = getInternalNode(node.id);

      if (!internalNode) {
        return null;
      }

      // Pre-filter nodes to only check those within reasonable distance
      const nodeArray = Array.from(nodeLookup.values());
      const potentialNodes = nodeArray.filter((n) => {
        if (n.id === internalNode.id) return false;

        // Quick distance check to filter out obviously too-far nodes
        const roughDx = Math.abs(n.internals.positionAbsolute.x - internalNode.internals.positionAbsolute.x);
        const roughDy = Math.abs(n.internals.positionAbsolute.y - internalNode.internals.positionAbsolute.y);

        return roughDx < minDistance * 2 && roughDy < minDistance * 2;
      });

      const closestNode = potentialNodes.reduce(
        (res, n) => {
          const dx = n.internals.positionAbsolute.x - internalNode.internals.positionAbsolute.x;
          const dy = n.internals.positionAbsolute.y - internalNode.internals.positionAbsolute.y;
          const d = Math.sqrt(dx * dx + dy * dy);

          if (d < res.distance && d < minDistance) {
            res.distance = d;
            res.node = n;
          }

          return res;
        },
        {
          distance: Number.MAX_VALUE,
          node: null as InternalNode<Node> | null,
        }
      );

      if (!closestNode.node) {
        return null;
      }

      const closeNodeIsSource =
        closestNode.node?.internals.positionAbsolute.x < internalNode.internals.positionAbsolute.x;

      // Create a proper Connection object that React Flow can handle
      return {
        source: closeNodeIsSource ? closestNode.node.id : node.id,
        target: closeNodeIsSource ? node.id : closestNode.node.id,
        sourceHandle: null, // Let React Flow use default handles
        targetHandle: null, // Let React Flow use default handles
      };
    },
    [minDistance, store, getInternalNode]
  );

  const onNodeDrag: OnNodeDrag = useCallback(
    (_: unknown, node: Node) => {
      const now = Date.now();

      // Throttle expensive calculations
      if (now - lastCalculationTime.current < THROTTLE_MS) {
        return;
      }

      lastCalculationTime.current = now;
      const closeConnection = getClosestConnection(node);

      // Only update if the closest connection actually changed
      const connectionChanged =
        !lastClosestConnection.current ||
        !closeConnection ||
        closeConnection.source !== lastClosestConnection.current.source ||
        closeConnection.target !== lastClosestConnection.current.target;

      if (!connectionChanged) {
        return;
      }

      lastClosestConnection.current = closeConnection;

      setEdges((es) => {
        const nextEdges = es.filter((e) => e.className !== 'temp');

        if (
          closeConnection &&
          !nextEdges.find((ne) => ne.source === closeConnection.source && ne.target === closeConnection.target)
        ) {
          // Create a temporary edge for visual feedback
          const tempEdge = {
            id: `temp-${closeConnection.source}-${closeConnection.target}`,
            source: closeConnection.source,
            target: closeConnection.target,
            className: 'temp',
            style: { strokeDasharray: '5,5' }, // Visual indication that it's temporary
          };
          nextEdges.push(tempEdge);
        }

        return nextEdges;
      });
    },
    [getClosestConnection, setEdges]
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_: unknown, node: Node) => {
      const closeConnection = getClosestConnection(node);
      lastClosestConnection.current = null;

      // Remove temporary edges
      setEdges((es) => es.filter((e) => e.className !== 'temp'));

      // Create a permanent connection if one was found
      if (closeConnection) {
        // Check if this connection already exists
        setEdges((es) => {
          if (!es.find((e) => e.source === closeConnection.source && e.target === closeConnection.target)) {
            // Use the proper onConnect to create the edge
            onConnect(closeConnection);
          }
          return es;
        });
      }
    },
    [getClosestConnection, setEdges, onConnect]
  );

  return {
    onNodeDrag,
    onNodeDragStop,
  };
}
