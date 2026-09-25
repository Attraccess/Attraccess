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
    const activeResources = resourceIds.length ? await this.resources.find({ select: { id: true, name: true }, where: { id: In(resourceIds) } }) : [];
    const activeById = new Map(activeResources.map((resource) => [String(resource.id), resource.name]));
    const valid = entries.filter((pin) => pin.itemType !== 'resource' || activeById.has(pin.itemId));
    const validIds = new Set(valid.map((pin) => pin.id));
    const staleIds = entries.filter((pin) => !validIds.has(pin.id)).map((pin) => pin.id);
    if (staleIds.length) await this.pins.delete({ userId, id: In(staleIds) });
    return valid.map(({ itemType, itemId }) => itemType === 'resource'
      ? { itemType, itemId, resourceName: activeById.get(itemId) }
      : { itemType, itemId });
  }

  async replace(userId: number, items: DashboardPinItem[]): Promise<DashboardPinItem[]> {
    if (!Array.isArray(items) || items.length > 200 || items.some((item) => !item || !['page', 'resource'].includes(item.itemType) || typeof item.itemId !== 'string' || !item.itemId.trim())) {
      throw new BadRequestException('Invalid dashboard pins');
    }
    const keys = items.map((item) => `${item.itemType}:${item.itemId}`);
    if (new Set(keys).size !== keys.length) throw new BadRequestException('Dashboard pins must be unique');
    if (items.some((item) => item.itemType === 'page' && !isPinnablePagePath(item.itemId))) {
      throw new BadRequestException('Page is not eligible for dashboard pinning');
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
      await repo.delete({ userId });
      if (items.length) await repo.insert(items.map(({ itemType, itemId }, position) => ({ userId, itemType, itemId, position })));
    });
    return items;
  }
}
