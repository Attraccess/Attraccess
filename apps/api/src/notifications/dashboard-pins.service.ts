import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DashboardPin, Resource, User } from '@attraccess/database-entities';
import { In, Repository } from 'typeorm';
import { UpdateDashboardPinsDto } from './dtos/dashboard-pins.dto';

export type DashboardPinItem = { itemType: 'page' | 'resource'; itemId: string; resourceName?: string };
// Built-in destinations are explicit. Plugins are installed independently of
// the API, so their internal sidebar paths cannot be enumerated here.
const eligiblePagePaths = new Set([
  '/resources', '/projects', '/messages', '/attractap/nfc-cards', '/billing', '/csv-export', '/users',
  '/attractap/readers', '/devices/mqtt/servers', '/devices/companion', '/balena', '/settings',
  '/dependencies', '/changelog', '/printables', '/shelly', '/wago', '/rabbitmq',
]);
function isEligiblePagePath(path: string): boolean {
  if (eligiblePagePaths.has(path)) return true;
  // Accept canonical, single-origin plugin routes while excluding routes that
  // must never be pinned and path tricks that could escape the app router.
  return path.startsWith('/') && !path.startsWith('//') && !/[?#\\\s]/.test(path) &&
    !path.split('/').some((segment) => segment === '.' || segment === '..') &&
    path !== '/kiosk' && path !== '/kiosk/display' && path !== '/dashboard' &&
    // Resource details are not sidebar pages. Match the route boundary so a
    // plugin page such as /resources/report remains pinnable.
    !/^\/resources\/\d+(?:\/|$)/.test(path);
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

  async update(userId: number, operation: UpdateDashboardPinsDto): Promise<DashboardPinItem[]> {
    const kind = operation?.kind;
    const item = operation?.item;
    const before = operation?.before;
    if (!['add', 'remove', 'move'].includes(kind) || !item || !['page', 'resource'].includes(item.itemType) || typeof item.itemId !== 'string' || !item.itemId.trim() ||
      (before && (!['page', 'resource'].includes(before.itemType) || typeof before.itemId !== 'string' || !before.itemId.trim())) ||
      (kind !== 'move' && before)) {
      throw new BadRequestException('Invalid dashboard pins');
    }
    if (kind === 'add' && item.itemType === 'page' && !isEligiblePagePath(item.itemId)) {
      throw new BadRequestException('Page is not eligible for dashboard pinning');
    }
    if (kind === 'add' && item.itemType === 'resource' &&
      (!Number.isSafeInteger(Number(item.itemId)) || Number(item.itemId) < 1 || String(Number(item.itemId)) !== item.itemId)) {
      throw new BadRequestException('Invalid resource pin');
    }
    if (kind === 'add' && item.itemType === 'resource') {
      const found = await this.resources.find({ where: { id: Number(item.itemId) } });
      if (!found.length) throw new BadRequestException('Resource does not exist');
    }
    const key = (pin: DashboardPinItem) => `${pin.itemType}:${pin.itemId}`;
    await this.pins.manager.transaction(async (manager) => {
      // The user row exists even when no pins do, so it serializes writes from every session.
      // SQLite does not support SELECT FOR UPDATE; acquire its writer lock before reading.
      if (manager.connection.options.type === 'sqlite') {
        await manager.query('UPDATE "user" SET "id" = "id" WHERE "id" = ?', [userId]);
      } else {
        await manager.getRepository(User).findOneOrFail({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      }
      const repo = manager.getRepository(DashboardPin);
      const current = await repo.find({ where: { userId }, order: { position: 'ASC' } });
      const next = current.map(({ itemType, itemId }) => ({ itemType, itemId }));
      const index = next.findIndex((pin) => key(pin) === key(item));
      if (kind === 'add' && index < 0) next.push(item);
      if (kind === 'remove' && index >= 0) next.splice(index, 1);
      if (kind === 'move' && index >= 0) {
        const [moving] = next.splice(index, 1);
        const target = before ? next.findIndex((pin) => key(pin) === key(before)) : -1;
        next.splice(target < 0 ? next.length : target, 0, moving);
      }
      if (next.length > 200) throw new BadRequestException('Invalid dashboard pins');
      if (next.length === current.length && next.every((pin, position) => key(pin) === key(current[position]))) return;
      await repo.delete({ userId });
      if (next.length) await repo.insert(next.map(({ itemType, itemId }, position) => ({ userId, itemType, itemId, position })));
    });
    return this.get(userId);
  }
}
