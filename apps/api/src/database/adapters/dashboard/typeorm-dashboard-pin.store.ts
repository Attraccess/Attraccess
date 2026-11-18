import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { StoredDashboardPin } from '@attraccess/application-models';
import { DashboardPin, Resource, User } from '@attraccess/database-entities';
import { DataSource, EntityManager, In } from 'typeorm';
import type { DashboardPinStore } from '../../../dashboard/dashboard-pin-store.port';
import { UNIT_OF_WORK, type TransactionScope, type UnitOfWork } from '../../unit-of-work';
import { managerFor } from '../transaction-scope';

const toStoredPin = ({ itemType, itemId, size }: DashboardPin): StoredDashboardPin => ({
  itemType,
  itemId,
  size: size ?? null,
});

@Injectable()
export class TypeOrmDashboardPinStore implements DashboardPinStore {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async listPins(userId: number, scope?: TransactionScope): Promise<StoredDashboardPin[]> {
    return this.readPins(managerFor(this.source, this.uow, scope), userId);
  }

  async listPinsForUpdate(userId: number, scope: TransactionScope): Promise<StoredDashboardPin[]> {
    const manager = managerFor(this.source, this.uow, scope);
    await this.lockUser(manager, userId);
    return this.readPins(manager, userId);
  }

  async replacePins(userId: number, pins: StoredDashboardPin[], scope: TransactionScope): Promise<void> {
    const repository = managerFor(this.source, this.uow, scope).getRepository(DashboardPin);
    await repository.delete({ userId });
    if (pins.length) {
      await repository.insert(pins.map((pin, position) => ({ userId, ...pin, position })));
    }
  }

  async deleteResourcePins(userId: number, resourceIds: string[], scope: TransactionScope): Promise<void> {
    if (!resourceIds.length) return;
    await managerFor(this.source, this.uow, scope)
      .getRepository(DashboardPin)
      .delete({ userId, itemType: 'resource', itemId: In(resourceIds) });
  }

  async resourceNames(resourceIds: number[]): Promise<Map<number, string>> {
    if (!resourceIds.length) return new Map();
    const resources = await this.source
      .getRepository(Resource)
      .find({ select: { id: true, name: true }, where: { id: In(resourceIds) } });
    return new Map(resources.map(({ id, name }) => [id, name]));
  }

  async resourceExists(resourceId: number): Promise<boolean> {
    return (await this.source.getRepository(Resource).count({ where: { id: resourceId } })) > 0;
  }

  private async readPins(manager: EntityManager, userId: number): Promise<StoredDashboardPin[]> {
    const pins = await manager.getRepository(DashboardPin).find({ where: { userId }, order: { position: 'ASC' } });
    return pins.map(toStoredPin);
  }

  /**
   * Writes from several tabs must not interleave between reading and rewriting the list: the user's row is locked
   * (FOR UPDATE) for the rest of the transaction. It exists even while the user has no pins, and only its id is
   * selected so no outer join ends up under the lock.
   */
  private async lockUser(manager: EntityManager, userId: number): Promise<void> {
    await manager
      .createQueryBuilder(User, 'user')
      .select('user.id')
      .where('user.id = :userId', { userId })
      .setLock('pessimistic_write')
      .getOneOrFail();
  }
}
