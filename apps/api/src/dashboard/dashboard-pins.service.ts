import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { StoredDashboardPin } from '@attraccess/application-models';
import { UNIT_OF_WORK, type UnitOfWork } from '../database/unit-of-work';
import { DASHBOARD_PIN_STORE, type DashboardPinStore } from './dashboard-pin-store.port';
import { isPinnablePagePath, isPinnableWidgetId } from './dashboard-items';
import { DashboardPinDto, DashboardPinItemDto, UpdateDashboardPinsDto } from './dtos/dashboard-pin.dto';

export const MAX_DASHBOARD_PINS = 200;

const keyOf = (item: DashboardPinItemDto) => `${item.itemType}:${item.itemId}`;

export type { StoredDashboardPin };

/** The pin list after one operation. Unknown items make remove, move and resize a no-op, so stale tabs cannot fail. */
export function applyDashboardPinOperation(
  current: StoredDashboardPin[],
  { kind, item, before, size }: UpdateDashboardPinsDto,
): StoredDashboardPin[] {
  const next = current.map(({ itemType, itemId, size: storedSize }) => ({ itemType, itemId, size: storedSize }));
  const index = next.findIndex((pin) => keyOf(pin) === keyOf(item));
  if (kind === 'add' && index < 0) next.push({ itemType: item.itemType, itemId: item.itemId, size: size ?? null });
  if (kind === 'remove' && index >= 0) next.splice(index, 1);
  if (kind === 'move' && index >= 0) {
    const [moving] = next.splice(index, 1);
    const target = before ? next.findIndex((pin) => keyOf(pin) === keyOf(before)) : -1;
    next.splice(target < 0 ? next.length : target, 0, moving);
  }
  if (kind === 'resize' && index >= 0 && size) next[index].size = size;
  return next;
}

const isUnchanged = (current: StoredDashboardPin[], next: StoredDashboardPin[]) =>
  next.length === current.length &&
  next.every((pin, position) => keyOf(pin) === keyOf(current[position]) && pin.size === current[position].size);

@Injectable()
export class DashboardPinsService {
  constructor(
    @Inject(DASHBOARD_PIN_STORE) private readonly store: DashboardPinStore,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  /** The user's pins in order. Pins of resources that no longer exist are deleted, not returned. */
  public async getPins(userId: number): Promise<DashboardPinDto[]> {
    const pins = await this.store.listPins(userId);
    const resourceIds = pins.filter((pin) => pin.itemType === 'resource').map((pin) => Number(pin.itemId));
    const resourceNames = await this.store.resourceNames(resourceIds);

    const stale = pins.filter((pin) => pin.itemType === 'resource' && !resourceNames.has(Number(pin.itemId)));
    if (stale.length) {
      await this.uow.run((scope) =>
        this.store.deleteResourcePins(
          userId,
          stale.map((pin) => pin.itemId),
          scope,
        ),
      );
    }

    return pins
      .filter((pin) => !stale.includes(pin))
      .map(({ itemType, itemId, size }) =>
        itemType === 'resource'
          ? { itemType, itemId, size: size ?? null, resourceName: resourceNames.get(Number(itemId)) }
          : { itemType, itemId, size: size ?? null },
      );
  }

  public async updatePins(userId: number, operation: UpdateDashboardPinsDto): Promise<DashboardPinDto[]> {
    // Only additions are checked: a pin that lost its page or widget must stay removable and movable.
    if (operation.kind === 'add') {
      await this.assertPinnable(operation.item);
    }

    await this.uow.run(async (scope) => {
      const current = await this.store.listPinsForUpdate(userId, scope);
      const next = applyDashboardPinOperation(current, operation);
      if (next.length > MAX_DASHBOARD_PINS) {
        throw new BadRequestException(`A dashboard holds at most ${MAX_DASHBOARD_PINS} pins`);
      }
      if (isUnchanged(current, next)) return;
      await this.store.replacePins(userId, next, scope);
    });

    return this.getPins(userId);
  }

  private async assertPinnable(item: DashboardPinItemDto): Promise<void> {
    if (item.itemType === 'page' && !isPinnablePagePath(item.itemId)) {
      throw new BadRequestException(`The page "${item.itemId}" cannot be pinned`);
    }
    if (item.itemType === 'widget' && !isPinnableWidgetId(item.itemId)) {
      throw new BadRequestException(`The widget "${item.itemId}" cannot be pinned`);
    }
    if (item.itemType === 'resource' && !(await this.store.resourceExists(Number(item.itemId)))) {
      throw new BadRequestException(`Resource ${item.itemId} does not exist`);
    }
  }
}
