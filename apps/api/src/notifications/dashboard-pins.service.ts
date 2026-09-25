import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DashboardPin, Resource } from '@attraccess/database-entities';
import { In, Repository } from 'typeorm';

export type DashboardPinItem = { itemType: 'page' | 'resource'; itemId: string; resourceName?: string };
const PINNABLE_PAGE_PATHS = new Set([
  '/resources', '/projects', '/messages', '/attractap/nfc-cards', '/billing', '/csv-export', '/users',
  '/attractap/readers', '/devices/mqtt/servers', '/devices/companion', '/balena', '/settings',
  '/dependencies', '/changelog', '/printables', '/shelly', '/rabbitmq', '/wago',
]);
// Plugin sidebar entries are defined by frontend modules and cannot be enumerated by the API.
// Accept canonical plugin paths while keeping the application's own routes restricted to the list above.
const CORE_PATH_ROOTS = new Set([
  'resources', 'projects', 'messages', 'attractap', 'billing', 'csv-export', 'users',
  'devices', 'balena', 'settings', 'dependencies', 'changelog', 'printables',
  'dashboard', 'kiosk', 'account', 'first-time-setup', 'confirm-delete-account',
  'resource-groups',
]);
function isEligiblePagePath(path: string): boolean {
  if (PINNABLE_PAGE_PATHS.has(path)) return true;
  if (!/^\/[a-z][a-z0-9-]*(?:\/[a-z0-9-]+)*$/.test(path)) return false;
  return !CORE_PATH_ROOTS.has(path.split('/')[1]);
}

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
    if (items.some((item) => item.itemType === 'page' && !isEligiblePagePath(item.itemId))) {
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
