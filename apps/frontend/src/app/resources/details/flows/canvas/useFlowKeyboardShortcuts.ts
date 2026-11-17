import { RefObject, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useFlowContext } from '../context/index';

/** Copy, cut, paste and select-all on the canvas; ignored while typing in a field. */
export function useFlowKeyboardShortcuts(mousePosRef: RefObject<{ x: number; y: number } | null>) {
  const { copySelectedNodes, cutSelectedNodes, pasteNodes, setNodes } = useFlowContext();
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest('input, textarea, select, [contenteditable="true"]')) {
        return;
      }
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === 'c') {
        copySelectedNodes();
      } else if (isMod && e.key === 'x') {
        cutSelectedNodes();
      } else if (isMod && e.key === 'v') {
        const targetFlowPosition = mousePosRef.current ? screenToFlowPosition(mousePosRef.current) : undefined;
        pasteNodes(targetFlowPosition);
      } else if (isMod && e.key === 'a') {
        e.preventDefault();
        setNodes((prev) => prev.map((n) => ({ ...n, selected: true })));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [copySelectedNodes, cutSelectedNodes, pasteNodes, setNodes, screenToFlowPosition, mousePosRef]);
}
