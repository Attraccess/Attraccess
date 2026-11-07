import { Resource, User } from '@attraccess/plugins-backend-sdk';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { PLUGIN_CONTEXT } from '../constants';

export interface ResourceSummary {
  id: number;
  name: string;
}

/** Read-only lookups into host tables (names only; nothing else about users/resources is exposed). */
@Injectable()
export class DirectoryService {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  async getResource(resourceId: number): Promise<ResourceSummary | null> {
    const row = await this.context
      .getRepository(Resource)
      .findOne({ where: { id: resourceId }, select: { id: true, name: true } });
    return row ? { id: row.id, name: row.name } : null;
  }

  async getResourceNames(resourceIds: number[]): Promise<Map<number, string>> {
    const ids = [...new Set(resourceIds)];
    if (ids.length === 0) return new Map();
    const rows = await this.context
      .getRepository(Resource)
      .createQueryBuilder('resource')
      .select(['resource.id', 'resource.name'])
      .where('resource.id IN (:...ids)', { ids })
      .getMany();
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async getUserNames(userIds: number[]): Promise<Map<number, string>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const rows = await this.context
      .getRepository(User)
      .createQueryBuilder('user')
      .select(['user.id', 'user.username'])
      .where('user.id IN (:...ids)', { ids })
      .getMany();
    return new Map(rows.map((row) => [row.id, row.username]));
  }
}
