import { CSSProperties, ReactNode } from 'react';
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

/** Makes a dashboard tile draggable by its handle, with pointer, touch or keyboard. */
function useSortablePin(id: string, dragLabel: string) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const dragHandle = (
    <span
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={dragLabel}
      className="cursor-grab touch-none rounded text-muted outline-none focus-visible:ring-2 focus-visible:ring-focus"
      data-cy="dashboard-card-drag-handle"
    >
      <GripVerticalIcon className="w-4 h-4" aria-hidden />
    </span>
  );
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : undefined,
  };

  return { setNodeRef, style, dragHandle };
}

/** A dashboard card that can be dragged by its handle. */
export function SortablePinCard({ id, dragLabel, children }: Readonly<SortablePinCardProps>) {
  const { setNodeRef, style, dragHandle } = useSortablePin(id, dragLabel);

  return (
    <Card ref={setNodeRef} style={style} data-cy="dashboard-card">
      {children(dragHandle)}
    </Card>
  );
}

/**
 * A draggable tile that holds form fields. Fields must not sit on a Card surface, where they take its colour and
 * disappear (ATT-294 / ATT-834), so this tile keeps the page background and only outlines itself like a card.
 */
export function SortablePinSection({ id, dragLabel, children }: Readonly<SortablePinCardProps>) {
  const { setNodeRef, style, dragHandle } = useSortablePin(id, dragLabel);

  return (
    <section
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-3 rounded-3xl border border-border bg-background p-4"
      data-cy="dashboard-card"
    >
      {children(dragHandle)}
    </section>
  );
}
