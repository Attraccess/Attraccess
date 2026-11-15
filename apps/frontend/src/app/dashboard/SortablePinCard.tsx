import { ReactNode } from 'react';
import { Card } from '@heroui/react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVerticalIcon } from 'lucide-react';

interface SortablePinCardProps {
  id: string;
  dragLabel: string;
  /** Receives the drag handle so each card places it in its own header. */
  children: (dragHandle: ReactNode) => ReactNode;
}

/** A dashboard card that can be dragged by its handle, with pointer, touch or keyboard. */
export function SortablePinCard({ id, dragLabel, children }: Readonly<SortablePinCardProps>) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const dragHandle = (
    <span
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={dragLabel}
      className="cursor-grab touch-none text-muted"
      data-cy="dashboard-card-drag-handle"
    >
      <GripVerticalIcon className="w-4 h-4" aria-hidden />
    </span>
  );

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 1 : undefined }}
      data-cy="dashboard-card"
    >
      {children(dragHandle)}
    </Card>
  );
}
