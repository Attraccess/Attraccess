import { CSSProperties, ReactNode } from 'react';
import { Button, Card } from '@heroui/react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVerticalIcon, XIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';

/** The edit controls of a card. Both are null outside edit mode, where the dashboard is a read-only view. */
export interface PinEditControls {
  dragHandle: ReactNode;
  removeButton: ReactNode;
}

interface SortablePinCardProps {
  id: string;
  title: string;
  isEditing: boolean;
  /** Omitted for cards that offer removal in their own content. */
  onRemove?: () => void;
  /** Receives the edit controls so each card places them in its own header. */
  children: (controls: PinEditControls) => ReactNode;
}

/** Makes a dashboard tile draggable by its handle, with pointer, touch or keyboard, while the dashboard is edited. */
function useSortablePin({ id, title, isEditing, onRemove }: Omit<SortablePinCardProps, 'children'>) {
  const { t } = useTranslations({ en, de });
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !isEditing,
  });

  const controls: PinEditControls = isEditing
    ? {
        dragHandle: (
          <span
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={t('card.dragHandle', { title })}
            className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted outline-none focus-visible:ring-2 focus-visible:ring-focus"
            data-cy="dashboard-card-drag-handle"
          >
            <GripVerticalIcon className="w-4 h-4" aria-hidden />
          </span>
        ),
        removeButton: onRemove && (
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={t('card.removeLabel', { title })}
            onPress={onRemove}
            data-cy="dashboard-card-remove-control"
          >
            <XIcon className="w-4 h-4" />
          </Button>
        ),
      }
    : { dragHandle: null, removeButton: null };
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : undefined,
  };

  return { setNodeRef, style, controls };
}

/** A dashboard card that can be dragged by its handle and removed while the dashboard is edited. */
export function SortablePinCard({ children, ...props }: Readonly<SortablePinCardProps>) {
  const { setNodeRef, style, controls } = useSortablePin(props);

  return (
    <Card ref={setNodeRef} style={style} data-cy="dashboard-card">
      {children(controls)}
    </Card>
  );
}

/**
 * A tile that holds form fields. Fields must not sit on a Card surface, where they take its colour and disappear
 * (ATT-294 / ATT-834), so this tile keeps the page background and only outlines itself like a card.
 */
export function SortablePinSection({ children, ...props }: Readonly<SortablePinCardProps>) {
  const { setNodeRef, style, controls } = useSortablePin(props);

  return (
    <section
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-3 rounded-3xl border border-border bg-background p-4"
      data-cy="dashboard-card"
    >
      {children(controls)}
    </section>
  );
}
