import { OnNodeDrag, useReactFlow, Connection } from '@xyflow/react';
import { useCallback, useRef } from 'react';
import { useFlowContext } from './flowContext';

const THROTTLE_MS = 32; // ~30fps - less frequent than snap connect since DOM queries are more expensive

export function useNodeEdgeIntersectionSnapConnect() {
  const { updateEdge, getEdge } = useReactFlow();
  const { onConnect } = useFlowContext();

  const overlappedEdgeRef = useRef<string | null>(null);
  const lastCalculationTime = useRef(0);
  const nodeRectCache = useRef<Map<string, { rect: DOMRect; timestamp: number }>>(new Map());
  const CACHE_DURATION = 100; // Cache node rects for 100ms

  const getNodeRect = useCallback((nodeId: string) => {
    const now = Date.now();
    const cached = nodeRectCache.current.get(nodeId);

    // Return cached rect if it's still fresh
    if (cached && now - cached.timestamp < CACHE_DURATION) {
      return cached.rect;
    }

    const nodeDiv = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`);
    if (!nodeDiv) return null;

    const rect = nodeDiv.getBoundingClientRect();
    nodeRectCache.current.set(nodeId, { rect, timestamp: now });

    // Clean up old cache entries
    if (nodeRectCache.current.size > 50) {
      for (const [key, value] of nodeRectCache.current.entries()) {
        if (now - value.timestamp > CACHE_DURATION * 2) {
          nodeRectCache.current.delete(key);
        }
      }
    }

    return rect;
  }, []);

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_, node) => {
      const edgeId = overlappedEdgeRef.current;
      if (!edgeId) return;
      const edge = getEdge(edgeId);
      if (!edge) return;

      // Clear the visual highlight
      updateEdge(edgeId, { source: edge.source, target: node.id, style: {} });

      // Create a proper Connection object for React Flow
      const connection: Connection = {
        source: node.id,
        target: edge.target,
        sourceHandle: null, // Let React Flow use default handles
        targetHandle: null, // Let React Flow use default handles
      };

      // Use onConnect to properly create the edge
      onConnect(connection);

      overlappedEdgeRef.current = null;
      // Clear cache for this node since position changed significantly
      nodeRectCache.current.delete(node.id);
    },
    [getEdge, onConnect, updateEdge]
  );

  const onNodeDrag: OnNodeDrag = useCallback(
    (_, node) => {
      const now = Date.now();

      // Throttle expensive DOM operations
      if (now - lastCalculationTime.current < THROTTLE_MS) {
        return;
      }

      lastCalculationTime.current = now;

      const rect = getNodeRect(node.id);
      if (!rect) return;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Use a single DOM query instead of multiple queries
      const elementsAtPoint = document.elementsFromPoint(centerX, centerY);
      const edgeFound = elementsAtPoint.find((el) =>
        el.classList.contains('react-flow__edge-interaction')
      )?.parentElement;

      const edgeId = edgeFound?.dataset.id;

      // Only update if the edge actually changed
      if (edgeId !== overlappedEdgeRef.current) {
        // Clear previous edge highlighting
        if (overlappedEdgeRef.current) {
          updateEdge(overlappedEdgeRef.current, { style: {} });
        }

        // Highlight new edge
        if (edgeId) {
          updateEdge(edgeId, { style: { stroke: 'black' } });
        }

        overlappedEdgeRef.current = edgeId || null;
      }
    },
    [updateEdge, getNodeRect]
  );

  return {
    onNodeDrag,
    onNodeDragStop,
  };
}
