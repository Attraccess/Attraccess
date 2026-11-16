import {
  closestCenter,
  DndContext,
  DndContextProps,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { DashboardPinItemType, DashboardPinOperationKind } from '@attraccess/react-query-client';
import { useToastMessage } from '../../components/toastProvider';
import {
  DashboardPin,
  DashboardPinItem,
  pinKey,
  useCancelDashboardPinsFetch,
  useSetDashboardPinsCache,
  useUpdateDashboardPins,
} from './pins';
import { usePinnablePages } from './pinnablePagesContext';
import { PagePinCard, PendingPinCard, ResourcePinCard, UnavailablePinCard } from './PinCards';
import { WidgetPinCard } from './WidgetPinCard';
import { useDashboardWidgets } from './widgets/widgetsContext';
import de from './de.json';
import en from './en.json';

const itemOf = ({ itemType, itemId }: DashboardPinItem): DashboardPinItem => ({ itemType, itemId });

/**
 * Moves a pin onto the place of another. The new order shows at once and is saved right away; when saving fails, the
 * stored order comes back and the user is told.
 */
export function usePinReorder(pins: DashboardPin[]) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const cancelPinsFetch = useCancelDashboardPinsFetch();
  const setPins = useSetDashboardPinsCache();
  const { mutate } = useUpdateDashboardPins();

  // On failure the shared mutation reloads the stored order.
  return (activeId: string, overId: string) => {
    const from = pins.findIndex((pin) => pinKey(pin) === activeId);
    const to = pins.findIndex((pin) => pinKey(pin) === overId);
    if (from < 0 || to < 0 || from === to) return;

    const reordered = arrayMove(pins, from, to);
    void cancelPinsFetch();
    setPins(reordered);
    const before = reordered[to + 1];
    mutate(
      {
        requestBody: {
          kind: DashboardPinOperationKind.MOVE,
          item: itemOf(reordered[to]),
          ...(before ? { before: itemOf(before) } : {}),
        },
      },
      { onError: () => toast.error({ title: t('reorderError') }) },
    );
  };
}

/** Screen reader texts for dragging, naming cards by their titles instead of their internal ids. */
export function useDragAccessibility(
  titleOf: (id: UniqueIdentifier) => string,
): NonNullable<DndContextProps['accessibility']> {
  const { t } = useTranslations({ en, de });

  return {
    screenReaderInstructions: { draggable: t('drag.instructions') },
    announcements: {
      onDragStart: ({ active }) => t('drag.start', { title: titleOf(active.id) }),
      onDragOver: ({ active, over }) =>
        over
          ? t('drag.over', { title: titleOf(active.id), target: titleOf(over.id) })
          : t('drag.outside', { title: titleOf(active.id) }),
      onDragEnd: ({ active, over }) =>
        over
          ? t('drag.end', { title: titleOf(active.id), target: titleOf(over.id) })
          : t('drag.endOutside', { title: titleOf(active.id) }),
      onDragCancel: ({ active }) => t('drag.cancel', { title: titleOf(active.id) }),
    },
  };
}

/**
 * The pinned cards in the user's order. Outside edit mode they are a read-only view: no edit controls, and no sensor
 * that could pick a card up. In edit mode dragging a card saves the new order at once.
 */
export function DashboardGrid({
  pins,
  isEditing,
  onRemoved,
}: Readonly<{ pins: DashboardPin[]; isEditing: boolean; onRemoved?: (index: number) => void }>) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const { mutate } = useUpdateDashboardPins();
  const reorder = usePinReorder(pins);
  const { pages, titleOf, isReady } = usePinnablePages();
  const widgets = useDashboardWidgets();
  // The sensors stay the same in both modes: DndContext uses them as effect dependencies, so their number must not
  // change. Outside edit mode the cards are disabled sortables without a handle, so no sensor can pick one up.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const remove = (pin: DashboardPin, index: number) => {
    onRemoved?.(index);
    mutate(
      { requestBody: { kind: DashboardPinOperationKind.REMOVE, item: itemOf(pin) } },
      { onError: () => toast.error({ title: t('pin.saveError') }) },
    );
  };

  const pinTitle = (pin: DashboardPin) => {
    if (pin.itemType === DashboardPinItemType.RESOURCE) return pin.resourceName ?? pin.itemId;
    if (pin.itemType === DashboardPinItemType.WIDGET)
      return t('card.widgetLabel', { title: widgets.titleOf(pin.itemId) ?? pin.itemId });
    return pages.find((page) => page.path === pin.itemId)?.title ?? titleOf(pin.itemId) ?? pin.itemId;
  };
  const accessibility = useDragAccessibility((id) => {
    const pin = pins.find((candidate) => pinKey(candidate) === id);
    return pin ? pinTitle(pin) : String(id);
  });

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over) reorder(String(active.id), String(over.id));
  };

  const renderCard = (pin: DashboardPin, index: number) => {
    const id = pinKey(pin);
    const props = { id, isEditing, onRemove: () => remove(pin, index) };
    if (pin.itemType === DashboardPinItemType.RESOURCE) return <ResourcePinCard key={id} {...props} pin={pin} />;

    const isWidget = pin.itemType === DashboardPinItemType.WIDGET;
    const widget = isWidget ? widgets.widgets.find((candidate) => candidate.id === pin.itemId) : undefined;
    if (widget) return <WidgetPinCard key={id} {...props} widget={widget} />;
    const page = isWidget ? undefined : pages.find((candidate) => candidate.path === pin.itemId);
    if (page) return <PagePinCard key={id} {...props} page={page} />;

    const title = pinTitle(pin);
    if (!(isWidget ? widgets.isReady : isReady)) return <PendingPinCard key={id} {...props} title={title} />;
    const description = t(isWidget ? 'card.unavailableWidgetDescription' : 'card.unavailableDescription');
    return <UnavailablePinCard key={id} {...props} title={title} description={description} />;
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={accessibility}
    >
      <SortableContext items={pins.map(pinKey)} strategy={rectSortingStrategy}>
        {/* Columns follow the space next to the sidebar, not the viewport, so cards never get too narrow. */}
        <div className="@container">
          <div className="grid grid-cols-1 items-start gap-4 @xl:grid-cols-2 @4xl:grid-cols-3" data-cy="dashboard-grid">
            {pins.map(renderCard)}
          </div>
        </div>
      </SortableContext>
    </DndContext>
  );
}
