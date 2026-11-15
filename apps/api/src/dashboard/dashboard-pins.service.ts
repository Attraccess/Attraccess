import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DashboardPin, Resource, User } from '@attraccess/database-entities';
import { EntityManager, In, Repository } from 'typeorm';
import { runSerializedTransaction } from '../database/run-serialized-transaction';
import { isPinnablePagePath } from './dashboard-page-paths';
import { DashboardPinDto, DashboardPinItemDto, UpdateDashboardPinsDto } from './dtos/dashboard-pin.dto';

export const MAX_DASHBOARD_PINS = 200;

const keyOf = (item: DashboardPinItemDto) => `${item.itemType}:${item.itemId}`;

/** The pin list after one operation. Unknown items make remove and move a no-op, so stale tabs cannot fail. */
export function applyDashboardPinOperation(
  current: DashboardPinItemDto[],
  { kind, item, before }: UpdateDashboardPinsDto,
): DashboardPinItemDto[] {
  const next = current.map(({ itemType, itemId }) => ({ itemType, itemId }));
  const index = next.findIndex((pin) => keyOf(pin) === keyOf(item));
  if (kind === 'add' && index < 0) next.push({ itemType: item.itemType, itemId: item.itemId });
  if (kind === 'remove' && index >= 0) next.splice(index, 1);
  if (kind === 'move' && index >= 0) {
    const [moving] = next.splice(index, 1);
    const target = before ? next.findIndex((pin) => keyOf(pin) === keyOf(before)) : -1;
    next.splice(target < 0 ? next.length : target, 0, moving);
  }
  return next;
}

@Injectable()
export class DashboardPinsService {
  constructor(
    @InjectRepository(DashboardPin)
    private readonly pinRepository: Repository<DashboardPin>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
  ) {}

  /** The user's pins in order. Pins of resources that no longer exist are deleted, not returned. */
  public async getPins(userId: number): Promise<DashboardPinDto[]> {
    const pins = await this.pinRepository.find({ where: { userId }, order: { position: 'ASC' } });
    const resourceIds = pins.filter((pin) => pin.itemType === 'resource').map((pin) => Number(pin.itemId));
    const resources = resourceIds.length
      ? await this.resourceRepository.find({ select: { id: true, name: true }, where: { id: In(resourceIds) } })
      : [];
    const resourceNames = new Map(resources.map((resource) => [String(resource.id), resource.name]));

    const stale = pins.filter((pin) => pin.itemType === 'resource' && !resourceNames.has(pin.itemId));
    if (stale.length) {
      await runSerializedTransaction(this.pinRepository.manager, (manager) =>
        manager.getRepository(DashboardPin).delete({ userId, id: In(stale.map((pin) => pin.id)) }),
      );
    }

    return pins
      .filter((pin) => !stale.includes(pin))
      .map(({ itemType, itemId }) =>
        itemType === 'resource' ? { itemType, itemId, resourceName: resourceNames.get(itemId) } : { itemType, itemId },
      );
  }

  public async updatePins(userId: number, operation: UpdateDashboardPinsDto): Promise<DashboardPinDto[]> {
    // Only additions are checked: a pin that lost its page must stay removable and movable.
    if (operation.kind === 'add') {
      await this.assertPinnable(operation.item);
    }

    await runSerializedTransaction(this.pinRepository.manager, async (manager) => {
      await this.lockUser(manager, userId);
      const repository = manager.getRepository(DashboardPin);
      const current = await repository.find({ where: { userId }, order: { position: 'ASC' } });
      const next = applyDashboardPinOperation(current, operation);
      if (next.length > MAX_DASHBOARD_PINS) {
        throw new BadRequestException(`A dashboard holds at most ${MAX_DASHBOARD_PINS} pins`);
      }
      if (next.length === current.length && next.every((pin, position) => keyOf(pin) === keyOf(current[position]))) {
        return;
      }
      await repository.delete({ userId });
      if (next.length) {
        await repository.insert(next.map((pin, position) => ({ userId, ...pin, position })));
      }
    });

    return this.getPins(userId);
  }

  private async assertPinnable(item: DashboardPinItemDto): Promise<void> {
    if (item.itemType === 'page' && !isPinnablePagePath(item.itemId)) {
      throw new BadRequestException(`The page "${item.itemId}" cannot be pinned`);
    }
    if (
      item.itemType === 'resource' &&
      !(await this.resourceRepository.count({ where: { id: Number(item.itemId) } }))
    ) {
      throw new BadRequestException(`Resource ${item.itemId} does not exist`);
    }
  }

  /**
   * Writes from several tabs must not interleave between reading and rewriting the list. SQLite serializes them in
   * runSerializedTransaction; other drivers lock the user's row, which exists even while the user has no pins.
   */
  private async lockUser(manager: EntityManager, userId: number): Promise<void> {
    if (manager.connection.options.type === 'sqlite') return;
    await manager.getRepository(User).findOneOrFail({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
  }
}
