import { useQueryClient } from '@tanstack/react-query';
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  DashboardPinItemType,
  DashboardPinOperationKind,
  UseDashboardServiceDashboardGetPinsKeyFn,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../components/toastProvider';
import { DashboardPin, DashboardPinItem, pinKey, useSetDashboardPinsCache, useUpdateDashboardPins } from './pins';
import { usePinnablePages } from './pinnablePagesContext';
import { PagePinCard, PendingPinCard, ResourcePinCard, UnavailablePinCard } from './PinCards';
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
  const queryClient = useQueryClient();
  const setPins = useSetDashboardPinsCache();
  const { mutate } = useUpdateDashboardPins();

  return (activeId: string, overId: string) => {
    const from = pins.findIndex((pin) => pinKey(pin) === activeId);
    const to = pins.findIndex((pin) => pinKey(pin) === overId);
    if (from < 0 || to < 0 || from === to) return;

    const reordered = arrayMove(pins, from, to);
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
      {
        onError: () => {
          toast.error({ title: t('reorderError') });
          void queryClient.invalidateQueries({ queryKey: UseDashboardServiceDashboardGetPinsKeyFn() });
        },
      },
    );
  };
}

/** The pinned cards in the user's order. Dragging a card saves the new order at once. */
export function DashboardGrid({ pins }: Readonly<{ pins: DashboardPin[] }>) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const { mutate } = useUpdateDashboardPins();
  const reorder = usePinReorder(pins);
  const { pages, titleOf, isReady } = usePinnablePages();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const remove = (pin: DashboardPin) =>
    mutate(
      { requestBody: { kind: DashboardPinOperationKind.REMOVE, item: itemOf(pin) } },
      { onError: () => toast.error({ title: t('pin.saveError') }) },
    );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over) reorder(String(active.id), String(over.id));
  };

  const renderCard = (pin: DashboardPin) => {
    const id = pinKey(pin);
    if (pin.itemType === DashboardPinItemType.RESOURCE) {
      return <ResourcePinCard key={id} id={id} pin={pin} onUnpin={() => remove(pin)} />;
    }
    const page = pages.find((candidate) => candidate.path === pin.itemId);
    if (page) return <PagePinCard key={id} id={id} page={page} onUnpin={() => remove(pin)} />;
    const title = titleOf(pin.itemId) ?? pin.itemId;
    if (!isReady) return <PendingPinCard key={id} id={id} title={title} />;
    return <UnavailablePinCard key={id} id={id} title={title} onUnpin={() => remove(pin)} />;
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={pins.map(pinKey)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3" data-cy="dashboard-grid">
          {pins.map(renderCard)}
        </div>
      </SortableContext>
    </DndContext>
  );
}
