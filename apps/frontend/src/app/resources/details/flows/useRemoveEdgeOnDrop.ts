import { Connection, Edge, reconnectEdge } from '@xyflow/react';
import { useCallback, useRef } from 'react';
import { useFlowContext } from './flowContext';

export function useRemoveEdgeOnDrop() {
  const edgeReconnectSuccessful = useRef(true);
  const { setEdges } = useFlowContext();

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      edgeReconnectSuccessful.current = true;
      setEdges((els) => reconnectEdge(oldEdge, newConnection, els));
    },
    [setEdges]
  );

  const onReconnectEnd = useCallback(
    (_: unknown, edge: Edge) => {
      if (!edgeReconnectSuccessful.current) {
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      }

      edgeReconnectSuccessful.current = true;
    },
    [setEdges]
  );

  return {
    onReconnectStart,
    onReconnect,
    onReconnectEnd,
  };
}
