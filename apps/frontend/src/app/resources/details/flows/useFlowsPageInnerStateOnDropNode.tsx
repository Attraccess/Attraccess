import { ResourceFlowLog } from '@attraccess/react-query-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import JSConfetti from 'js-confetti';
import type { useFlowsPageInnerStateNodesHaveChanged } from './useFlowsPageInnerStateNodesHaveChanged';

export function useFlowsPageInnerStateOnDropNode(model: ReturnType<typeof useFlowsPageInnerStateNodesHaveChanged>) {
  const { screenToFlowPosition, addNode, nodes, setNodes, addLiveLogReceiver, removeLiveLogReceiver } = model;
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

  const [flowIsRunning, setFlowIsRunning] = useState(false);
  const flowExecutionHadError = useRef(false);
  const [confettiEnabled, setConfettiEnabled] = useState(false);
  const confettiRef = useRef<JSConfetti | null>(null);

  useEffect(() => {
    if (!confettiEnabled) return;

    const confetti = new JSConfetti();
    confettiRef.current = confetti;
    return () => {
      confettiRef.current = null;
      confetti.clearCanvas();
      confetti.destroyCanvas();
    };
  }, [confettiEnabled]);

  const isCoarsePointer = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }, []);
  const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>(() => (isCoarsePointer ? 'pan' : 'select'));
  // @xyflow/react's mouse-button array in panOnDrag doesn't apply to touch, so for select mode on touch we must disable pan entirely.
  const panOnDrag = interactionMode === 'pan' ? true : isCoarsePointer ? false : [1, 2];
  const selectionOnDrag = interactionMode === 'select';

  const onLiveLog = useCallback(
    (log: ResourceFlowLog) => {
      if (log.type === 'node.processing.failed') {
        flowExecutionHadError.current = true;
        return;
      }

      if (log.type === 'flow.start') {
        setFlowIsRunning(true);
        return;
      }

      if (log.type === 'flow.completed') {
        setFlowIsRunning(false);

        if (!flowExecutionHadError.current) {
          confettiRef.current?.addConfetti();
        } else {
          confettiRef.current?.addConfetti({
            emojis: ['❌', '😢', '💔', '😭', '🚫', '⚠️', '💥', '👎'],
            emojiSize: 100,
            confettiNumber: 2,
          });
        }

        flowExecutionHadError.current = false;
      }
    },
    [setFlowIsRunning],
  );

  useEffect(() => {
    addLiveLogReceiver(onLiveLog);
    return () => {
      removeLiveLogReceiver(onLiveLog);
    };
  }, [addLiveLogReceiver, removeLiveLogReceiver, onLiveLog]);
  return {
    ...model,
    onDropNode,
    flowIsRunning,
    setFlowIsRunning,
    flowExecutionHadError,
    confettiEnabled,
    setConfettiEnabled,
    confettiRef,
    isCoarsePointer,
    interactionMode,
    setInteractionMode,
    panOnDrag,
    selectionOnDrag,
    onLiveLog,
  } as const;
}
