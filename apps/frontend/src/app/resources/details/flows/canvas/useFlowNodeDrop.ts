import { useCallback, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useFlowContext } from '../context/index';

/** Drag and drop of catalogue nodes onto the canvas; a dropped node is centered on the drop point once measured. */
export function useFlowNodeDrop() {
  const { nodes, setNodes, addNode } = useFlowContext();
  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDropNode = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/reactflow');
      if (!nodeType) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNode({ id: nanoid(), position, type: nodeType, data: { __centerOnDrop: true } });
    },
    [addNode, screenToFlowPosition],
  );

  useEffect(() => {
    const pending = nodes.find((n) => {
      const flagged = (n.data as { __centerOnDrop?: boolean })?.__centerOnDrop === true;
      return flagged && n.measured?.width != null && n.measured?.height != null;
    });
    if (!pending) return;
    const w = pending.measured?.width ?? 0;
    const h = pending.measured?.height ?? 0;
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== pending.id) return n;
        const nextData = { ...(n.data as Record<string, unknown>) };
        delete nextData.__centerOnDrop;
        return {
          ...n,
          position: { x: n.position.x - w / 2, y: n.position.y - h / 2 },
          data: nextData,
        };
      }),
    );
  }, [nodes, setNodes]);

  return { onDragOver, onDropNode };
}
