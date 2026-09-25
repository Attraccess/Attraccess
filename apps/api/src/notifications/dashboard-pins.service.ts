import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DashboardPin, Resource } from '@attraccess/database-entities';
import { In, Repository } from 'typeorm';

export type DashboardPinItem = { itemType: 'page' | 'resource'; itemId: string };
const isPinnablePagePath = (path: string) =>
  /^\/(?!\/)[a-zA-Z0-9/_-]+$/.test(path) && path !== '/dashboard' && path !== '/kiosk' && !path.startsWith('/kiosk/');

@Injectable()
export class DashboardPinsService {
  constructor(
    @InjectRepository(DashboardPin) private readonly pins: Repository<DashboardPin>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
  ) {}

  async get(userId: number): Promise<DashboardPinItem[]> {
    const entries = await this.pins.find({ where: { userId }, order: { position: 'ASC' } });
    const resourceIds = entries.filter((pin) => pin.itemType === 'resource').map((pin) => Number(pin.itemId));
    const activeResources = resourceIds.length ? await this.resources.find({ where: { id: In(resourceIds) } }) : [];
    const activeIds = new Set(activeResources.map((resource) => String(resource.id)));
    const valid = entries.filter((pin) => pin.itemType !== 'resource' || activeIds.has(pin.itemId));
    if (valid.length !== entries.length) {
      const invalidResources = entries.filter((pin) => pin.itemType === 'resource' && !activeIds.has(pin.itemId));
      for (const pin of invalidResources) await this.pins.delete({ userId, itemType: 'resource', itemId: pin.itemId });
    }
    return valid.map(({ itemType, itemId }) => ({ itemType, itemId }));
  }

  async replace(userId: number, items: DashboardPinItem[], operation?: { kind: 'add' | 'remove' | 'reorder'; item?: DashboardPinItem; order?: string[] }): Promise<DashboardPinItem[]> {
    if (!Array.isArray(items) || items.length > 200 || items.some((item) => !item || !['page', 'resource'].includes(item.itemType) || typeof item.itemId !== 'string' || !item.itemId.trim())) {
      throw new BadRequestException('Invalid dashboard pins');
    }
    const keys = items.map((item) => `${item.itemType}:${item.itemId}`);
    if (new Set(keys).size !== keys.length) throw new BadRequestException('Dashboard pins must be unique');
    if (items.some((item) => item.itemType === 'page' && !isPinnablePagePath(item.itemId))) {
      throw new BadRequestException('Page is not eligible for dashboard pinning');
    }
    if (operation?.item?.itemType === 'page' && !isPinnablePagePath(operation.item.itemId)) {
      throw new BadRequestException('Page is not eligible for dashboard pinning');
    }
    const operationItem = operation?.item;
    if (operation?.kind === 'add' && (!operationItem || !items.some((item) => item.itemType === operationItem.itemType && item.itemId === operationItem.itemId))) {
      throw new BadRequestException('Added pin must be present in the requested list');
    }
    if (operation?.kind === 'remove' && operationItem && items.some((item) => item.itemType === operationItem.itemType && item.itemId === operationItem.itemId)) {
      throw new BadRequestException('Removed pin must be absent from the requested list');
    }
    const resourceIds = items.filter((item) => item.itemType === 'resource').map((item) => Number(item.itemId));
    if (items.some((item) => item.itemType === 'resource' &&
      (!Number.isSafeInteger(Number(item.itemId)) || Number(item.itemId) < 1 || String(Number(item.itemId)) !== item.itemId))) {
      throw new BadRequestException('Invalid resource pin');
    }
    if (resourceIds.length) {
      const found = await this.resources.find({ where: { id: In(resourceIds) } });
      if (found.length !== resourceIds.length) throw new BadRequestException('Resource does not exist');
    }
    await this.pins.manager.transaction(async (manager) => {
      const repo = manager.getRepository(DashboardPin);
      let nextItems = items;
      if (operation) {
        const current = await repo.find({ where: { userId }, order: { position: 'ASC' } });
        const key = (item: DashboardPinItem) => `${item.itemType}:${item.itemId}`;
        const item = operation.item;
        const order = operation.order;
        if (operation.kind === 'add' && item) {
          nextItems = current.map(({ itemType, itemId }) => ({ itemType, itemId }));
          if (!current.some((pin) => key(pin) === key(item))) nextItems.push(item);
        } else if (operation.kind === 'remove' && item) {
          nextItems = current.filter((pin) => key(pin) !== key(item)).map(({ itemType, itemId }) => ({ itemType, itemId }));
        } else if (operation.kind === 'reorder' && order) {
          const byKey = new Map(current.map((pin) => [key(pin), { itemType: pin.itemType, itemId: pin.itemId }]));
          nextItems = [...order.flatMap((itemKey) => { const found = byKey.get(itemKey); return found ? [found] : []; }), ...current.filter((pin) => !order.includes(key(pin))).map(({ itemType, itemId }) => ({ itemType, itemId }))];
        }
      }
      await repo.delete({ userId });
      if (nextItems.length) await repo.insert(nextItems.map(({ itemType, itemId }, position) => ({ userId, itemType, itemId, position })));
      items = nextItems;
    });
    return items;
  }
}
