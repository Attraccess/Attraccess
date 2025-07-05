import React, { useCallback } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react';
import { Button, cn } from '@heroui/react';
import { Trash2Icon } from 'lucide-react';
import { useDebounce } from '../../../../hooks/useDebounce';

export function EdgeWithDeleteButton(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    selected,
  } = props;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const { setEdges } = useReactFlow();
  const removeEdge = useCallback(() => {
    if (!selected) {
      return;
    }

    setEdges((edges) => edges.filter((edge) => edge.id !== id));
  }, [id, selected, setEdges]);

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        {selected && (
          <Button
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            onPress={removeEdge}
            isDisabled={!selected}
            isIconOnly
            startContent={<Trash2Icon />}
          />
        )}
      </EdgeLabelRenderer>
    </>
  );
}
