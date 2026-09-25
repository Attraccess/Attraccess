import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DashboardPin, Resource } from '@attraccess/database-entities';
import { In, Repository } from 'typeorm';

export type DashboardPinItem = { itemType: 'page' | 'resource'; itemId: string };
const PINNABLE_PAGE_PATHS = new Set([
  '/resources', '/projects', '/messages', '/attractap/nfc-cards', '/billing', '/csv-export', '/users',
  '/attractap/readers', '/devices/mqtt/servers', '/devices/companion', '/balena', '/settings',
  '/dependencies', '/changelog', '/printables', '/shelly', '/rabbitmq', '/wago',
]);

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

  async replace(userId: number, items: DashboardPinItem[]): Promise<DashboardPinItem[]> {
    if (!Array.isArray(items) || items.length > 200 || items.some((item) => !item || !['page', 'resource'].includes(item.itemType) || typeof item.itemId !== 'string' || !item.itemId.trim())) {
      throw new BadRequestException('Invalid dashboard pins');
    }
    const keys = items.map((item) => `${item.itemType}:${item.itemId}`);
    if (new Set(keys).size !== keys.length) throw new BadRequestException('Dashboard pins must be unique');
    if (items.some((item) => item.itemType === 'page' && !PINNABLE_PAGE_PATHS.has(item.itemId))) {
      throw new BadRequestException('Page is not eligible for dashboard pinning');
    }
    const resourceIds = items.filter((item) => item.itemType === 'resource').map((item) => Number(item.itemId));
    if (resourceIds.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new BadRequestException('Invalid resource pin');
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
