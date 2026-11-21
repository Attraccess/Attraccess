import type { PluginActiveSession, PluginContext, PluginTransactionScope } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { PLUGIN_CONTEXT } from '../constants';
import { sessionLimitOf } from './capacity';

export interface ResourceSummary {
  id: number;
  name: string;
}

/** Read-only host lookups through `hostData` (names and limits only; nothing else about users/resources is exposed). */
@Injectable()
export class DirectoryService {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  async getResource(resourceId: number): Promise<ResourceSummary | null> {
    const row = await this.context.hostData.resources.get(resourceId);
    return row ? { id: row.id, name: row.name } : null;
  }

  /**
   * Effective session limit (core's rule): 1 for doors, unknown resources and machines without parallel sessions.
   * With `scope` it is read inside that transaction.
   */
  async getSessionLimit(resourceId: number, scope?: PluginTransactionScope): Promise<number> {
    return (await this.findSessionLimit(resourceId, scope)) ?? 1;
  }

  /** Effective session limit, or null when the resource does not exist (anymore: deleted resources are not found). */
  async findSessionLimit(resourceId: number, scope?: PluginTransactionScope): Promise<number | null> {
    const row = await this.context.hostData.resources.get(resourceId, scope);
    return row ? sessionLimitOf(row) : null;
  }

  /** Running sessions on the resource, earliest first. */
  getActiveSessions(resourceId: number): Promise<PluginActiveSession[]> {
    return this.context.resourceAccess.getActiveSessions(resourceId);
  }

  getResourceNames(resourceIds: number[]): Promise<Map<number, string>> {
    return this.context.hostData.resources.getNames(resourceIds);
  }

  getUserNames(userIds: number[]): Promise<Map<number, string>> {
    return this.context.hostData.users.getDisplayNames(userIds);
  }
}
