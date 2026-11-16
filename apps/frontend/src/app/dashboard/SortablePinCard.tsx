import { CSSProperties, forwardRef, PropsWithChildren, ReactNode, useEffect, useRef } from 'react';
import {
  Button,
  Card,
  cn,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
} from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVerticalIcon, Maximize2Icon, XIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { TILE_SIZES, TILE_SPAN_CLASSES, TileSize } from './sizes';
import de from './de.json';
import en from './en.json';

/** The edit controls of a tile. All are null outside edit mode, where the dashboard is a read-only view. */
export interface PinEditControls {
  dragHandle: ReactNode;
  /** Only for items offering more than one size. */
  sizeControl: ReactNode;
  removeButton: ReactNode;
}

// Edit controls are slightly smaller than a small button, so the header row keeps the height it has outside edit mode
// and the tile's content does not lose room while editing.
const CONTROL_SIZE = 'size-7 min-w-7 shrink-0';

export const NO_EDIT_CONTROLS: PinEditControls = { dragHandle: null, sizeControl: null, removeButton: null };

export interface PinTileProps {
  id: string;
  title: string;
  size: TileSize;
  /** The sizes the item offers; the size control lists them. */
  sizes?: readonly TileSize[];
  isEditing: boolean;
  /** A tile in the "Add widget" gallery: not sortable and without edit controls. */
  isPreview?: boolean;
  /**
   * `section` for tiles with form fields: fields must not sit on a Card surface, where they take its colour and
   * disappear (ATT-294 / ATT-834), so such a tile keeps the page background and only outlines itself like a card.
   */
  surface?: 'card' | 'section';
  /** Omitted for tiles that offer removal in their own content. */
  onRemove?: () => void;
  onResize?: (size: TileSize) => void;
  /** Receives the edit controls so each tile places them in its own header. */
  children: (controls: PinEditControls) => ReactNode;
}

// The tile whose size control takes focus once it shows its new size. A tile changing to or from small rebuilds its
// header (a resource tile its whole content), so the control the menu would return focus to is gone by then.
let refocusAfterResize: string | null = null;

function SizeControl({
  id,
  title,
  size,
  sizes,
  onResize,
}: Readonly<{
  id: string;
  title: string;
  size: TileSize;
  sizes: readonly TileSize[];
  onResize: (size: TileSize) => void;
}>) {
  const { t } = useTranslations({ en, de });
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (refocusAfterResize !== id) return;
    refocusAfterResize = null;
    triggerRef.current?.focus();
  }, [id, size]);

  return (
    <Dropdown>
      <DropdownTrigger
        ref={triggerRef}
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm', isIconOnly: true }), CONTROL_SIZE)}
        aria-label={t('card.sizeLabel', { title })}
        data-cy="dashboard-card-size-control"
      >
        <Maximize2Icon className="w-4 h-4" aria-hidden />
      </DropdownTrigger>
      <DropdownPopover>
        <DropdownMenu
          aria-label={t('card.sizeLabel', { title })}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[size]}
          onSelectionChange={(keys) => {
            const next = keys === 'all' ? undefined : ([...keys][0] as TileSize | undefined);
            if (!next || next === size) return;
            refocusAfterResize = id;
            onResize(next);
          }}
        >
          {TILE_SIZES.filter((option) => sizes.includes(option)).map((option) => (
            <DropdownItem key={option} id={option} data-cy={`dashboard-card-size-${option}`}>
              {t(`sizes.${option}`)}
            </DropdownItem>
          ))}
        </DropdownMenu>
      </DropdownPopover>
    </Dropdown>
  );
}

/** Makes a dashboard tile draggable by its handle, with pointer, touch or keyboard, while the dashboard is edited. */
function useSortablePin({ id, title, size, sizes, isEditing, onRemove, onResize }: Omit<PinTileProps, 'children'>) {
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
        sizeControl: onResize && sizes && sizes.length > 1 && (
          <SizeControl id={id} title={title} size={size} sizes={sizes} onResize={onResize} />
        ),
        removeButton: onRemove && (
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            className={CONTROL_SIZE}
            aria-label={t('card.removeLabel', { title })}
            onPress={onRemove}
            data-cy="dashboard-card-remove-control"
          >
            <XIcon className="w-4 h-4" />
          </Button>
        ),
      }
    : NO_EDIT_CONTROLS;
  const style: CSSProperties = {
    // Moves tiles without scaling them: with mixed sizes the sorting strategy would stretch a tile to the shape of the
    // one whose place it takes, distorting its content while dragging.
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 1 : undefined,
  };

  return { setNodeRef, style, controls };
}

type SurfaceProps = PropsWithChildren<{ surface: 'card' | 'section'; size: TileSize; style?: CSSProperties }>;

/**
 * The tile itself: it fills its grid cells and never grows past them. Widgets show a fixed amount of content per
 * size, so clipping is only a safety net.
 */
const TileSurface = forwardRef<HTMLDivElement, SurfaceProps>(function TileSurface(
  { surface, size, style, children },
  ref,
) {
  const layout = cn(TILE_SPAN_CLASSES[size], 'h-full min-w-0 gap-2 overflow-hidden p-3');
  const dataProps = { 'data-cy': 'dashboard-card', 'data-size': size };
  if (surface === 'section') {
    return (
      <section
        ref={ref}
        style={style}
        className={cn(layout, 'flex flex-col rounded-3xl border border-border bg-background')}
        {...dataProps}
      >
        {children}
      </section>
    );
  }
  return (
    <Card ref={ref} style={style} className={layout} {...dataProps}>
      {children}
    </Card>
  );
});

function SortableTile({ children, surface = 'card', ...props }: Readonly<PinTileProps>) {
  const { setNodeRef, style, controls } = useSortablePin(props);
  return (
    <TileSurface ref={setNodeRef} style={style} surface={surface} size={props.size}>
      {children(controls)}
    </TileSurface>
  );
}

/** A dashboard tile, sortable and with edit controls while the dashboard is edited, or a still gallery preview. */
export function PinTile(props: Readonly<PinTileProps>) {
  if (props.isPreview) {
    return (
      <TileSurface surface={props.surface ?? 'card'} size={props.size}>
        {props.children(NO_EDIT_CONTROLS)}
      </TileSurface>
    );
  }
  return <SortableTile {...props} />;
}
