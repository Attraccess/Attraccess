import { Resource, ResourceGroup, type PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { PLUGIN_CONTEXT } from '../constants';
import { AccessService } from '../reservations/access.service';

/** Same predicate core uses for hidden resource groups (ResourceGroupsService.ACTIVE_INTRODUCTION_EXISTS_SQL). */
const ACTIVE_INTRODUCTION_EXISTS_SQL = `EXISTS (
  SELECT 1 FROM "resource_introduction" "rin"
  WHERE "rin"."resourceGroupId" = vg.id AND "rin"."receiverUserId" = :userId
  AND (
    SELECT "h"."action" FROM "resource_introduction_history_item" "h"
    WHERE "h"."introductionId" = "rin"."id"
    ORDER BY "h"."createdAt" DESC, "h"."id" DESC
    LIMIT 1
  ) = 'grant'
)`;

/**
 * Which resources a user may see. Core hides resources that only belong to hidden groups unless the
 * user holds `resources.update`, is an introducer/maintainer of such a group, or has an active
 * introduction to it (`ResourceGroupsService.visibleGroupsQuery`). That predicate is not exposed through
 * `resourceAccess`, so it is mirrored here with a read-only query (DATABASE_ACCESS) rather than guessing.
 */
@Injectable()
export class VisibilityService {
  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}

  /** The subset of `resourceIds` (existing resources) the user may see. */
  async filterVisible(userId: number, resourceIds: number[]): Promise<number[]> {
    const ids = [...new Set(resourceIds)];
    if (ids.length === 0) return [];
    const base = this.context
      .getRepository(Resource)
      .createQueryBuilder('resource')
      .select('resource.id', 'id')
      .where('resource.id IN (:...ids)', { ids });
    if (!(await this.access.hasUpdatePermission(userId))) {
      const visibleGroups = this.context
        .getRepository(ResourceGroup)
        .createQueryBuilder('vg')
        .select('vg.id')
        .where('vg.isHidden = :notHidden', { notHidden: false })
        .orWhere(
          `EXISTS (SELECT 1 FROM "resource_introducer" "ri" WHERE "ri"."resourceGroupId" = vg.id AND "ri"."userId" = :userId)`,
        )
        .orWhere(ACTIVE_INTRODUCTION_EXISTS_SQL);
      base
        .leftJoin('resource.groups', 'rg')
        .andWhere(new Brackets((qb) => qb.where('rg.id IS NULL').orWhere(`rg.id IN (${visibleGroups.getQuery()})`)))
        .setParameters({ ...visibleGroups.getParameters(), notHidden: false, userId });
    }
    const rows = await base.distinct(true).getRawMany<{ id: number }>();
    return rows.map((row) => Number(row.id));
  }

  /** Ids of all resources in the given groups. */
  async resourceIdsOfGroups(groupIds: number[]): Promise<number[]> {
    if (groupIds.length === 0) return [];
    const rows = await this.context
      .getRepository(Resource)
      .createQueryBuilder('resource')
      .select('resource.id', 'id')
      .innerJoin('resource.groups', 'g')
      .where('g.id IN (:...groupIds)', { groupIds })
      .distinct(true)
      .getRawMany<{ id: number }>();
    return rows.map((row) => Number(row.id));
  }
}
