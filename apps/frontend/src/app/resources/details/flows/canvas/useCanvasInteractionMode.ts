import { useMemo, useState } from 'react';

/** Pan or box-select on the canvas; touch screens start in pan mode because they cannot drag-pan in select mode. */
export function useCanvasInteractionMode() {
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

  return { interactionMode, setInteractionMode, panOnDrag, selectionOnDrag };
}
