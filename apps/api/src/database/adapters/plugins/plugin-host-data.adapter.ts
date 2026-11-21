import {
  Resource,
  ResourceFlowNode,
  ResourceGroup,
  ResourceHealthState,
  ResourceIntroducer,
  Setting,
  User,
  UserRole,
} from '@attraccess/database-entities';
import type {
  PluginFlowDirectory,
  PluginFlowNodeQuery,
  PluginFlowNodeReference,
  PluginHostDataContext,
  PluginResourceDirectory,
  PluginSettingsDirectory,
  PluginTransactionScope,
  PluginUserDirectory,
} from '@attraccess/plugins-backend-sdk';
import { handleOfScope } from '../../../plugin-system/persistence/plugin-transaction-scope';
import { Brackets, DataSource, EntityManager, In, SelectQueryBuilder } from 'typeorm';
import type { PluginResourceDisplayModel, PluginResourceModel } from '@attraccess/application-models';
import { resourceImageUrl } from '../../../resources/resource-image-url';

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

const DATA_KEY = /^[A-Za-z0-9_]{1,64}$/;

const unique = (ids: number[]): number[] => [...new Set(ids)];

function toResourceModel(row: Resource): PluginResourceModel {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description ?? null,
    allowTakeOver: row.allowTakeOver,
    maxParallelSessions: row.maxParallelSessions,
    supervisionMode: row.supervisionMode,
  };
}

class ResourceDirectory implements PluginResourceDirectory {
  constructor(private readonly source: () => DataSource) {}

  async get(resourceId: number, scope?: PluginTransactionScope): Promise<PluginResourceModel | null> {
    // With a scope the read joins the plugin's transaction (its connection), never the shared one.
    const manager = scope ? handleOfScope<EntityManager>(scope) : this.source().manager;
    const row = await manager.getRepository(Resource).findOne({ where: { id: resourceId } });
    return row ? toResourceModel(row) : null;
  }

  async getNames(resourceIds: number[]): Promise<Map<number, string>> {
    const ids = unique(resourceIds);
    if (ids.length === 0) return new Map();
    const rows = await this.source()
      .getRepository(Resource)
      .createQueryBuilder('resource')
      .select(['resource.id', 'resource.name'])
      .where('resource.id IN (:...ids)', { ids })
      .getMany();
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async listDisplay(resourceIds?: number[]): Promise<PluginResourceDisplayModel[]> {
    const query = this.source()
      .getRepository(Resource)
      .createQueryBuilder('resource')
      .select(['resource.id', 'resource.name', 'resource.imageFilename'])
      .orderBy('resource.name', 'ASC')
      .addOrderBy('resource.id', 'ASC');
    if (resourceIds) {
      const ids = unique(resourceIds);
      if (ids.length === 0) return [];
      query.where('resource.id IN (:...ids)', { ids });
    }
    const rows = await query.getMany();
    return rows.map((row) => ({ id: row.id, name: row.name, imageUrl: resourceImageUrl(row.id, row.imageFilename) }));
  }

  async filterVisible(userId: number, resourceIds: number[], options?: { seeAll?: boolean }): Promise<number[]> {
    const ids = unique(resourceIds);
    if (ids.length === 0) return [];
    const base = this.source()
      .getRepository(Resource)
      .createQueryBuilder('resource')
      .select('resource.id', 'id')
      .where('resource.id IN (:...ids)', { ids });
    if (!options?.seeAll) {
      const visibleGroups = this.source()
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

  async filterRequiringSupervision(resourceIds: number[]): Promise<number[]> {
    const ids = unique(resourceIds);
    if (ids.length === 0) return [];
    const rows = await this.source()
      .getRepository(Resource)
      .createQueryBuilder('resource')
      .select('resource.id', 'id')
      .where('resource.id IN (:...ids)', { ids })
      .andWhere('resource.supervisionMode = :mode', { mode: 'supervision_required' })
      .getRawMany<{ id: number }>();
    return rows.map((row) => Number(row.id));
  }

  async listIdsInGroups(groupIds: number[]): Promise<number[]> {
    if (groupIds.length === 0) return [];
    const rows = await this.source()
      .getRepository(Resource)
      .createQueryBuilder('resource')
      .select('resource.id', 'id')
      .innerJoin('resource.groups', 'g')
      .where('g.id IN (:...groupIds)', { groupIds })
      .distinct(true)
      .getRawMany<{ id: number }>();
    return rows.map((row) => Number(row.id));
  }

  countUnhealthyEntries(resourceId: number): Promise<number> {
    return this.source()
      .getRepository(ResourceHealthState)
      .countBy({ resourceId, status: 'unhealthy' as never });
  }

  async listIntroducerUserIds(resourceId: number): Promise<number[]> {
    const rows = await this.source()
      .getRepository(ResourceIntroducer)
      .createQueryBuilder('introducer')
      .select('introducer.userId', 'userId')
      .innerJoin('introducer.user', 'user', 'user.deletedAt IS NULL')
      .leftJoin('introducer.resourceGroup', 'group')
      .leftJoin('group.resources', 'resource')
      .where('(introducer.resourceId = :resourceId OR resource.id = :resourceId)', { resourceId })
      .getRawMany<{ userId: number }>();
    return unique(rows.map((row) => Number(row.userId)));
  }
}

class UserDirectory implements PluginUserDirectory {
  constructor(private readonly source: () => DataSource) {}

  async getUsernames(userIds: number[]): Promise<Map<number, string>> {
    const ids = unique(userIds);
    if (ids.length === 0) return new Map();
    const rows = await this.source()
      .getRepository(User)
      .createQueryBuilder('user')
      .select(['user.id', 'user.username'])
      .where('user.id IN (:...ids)', { ids })
      .getMany();
    return new Map(rows.map((row) => [row.id, row.username]));
  }

  async getLocales(userIds: number[]): Promise<Map<number, string | null>> {
    const ids = unique(userIds);
    if (ids.length === 0) return new Map();
    const rows = await this.source()
      .getRepository(User)
      .createQueryBuilder('user')
      .select(['user.id', 'user.locale'])
      .where('user.id IN (:...ids)', { ids })
      .getMany();
    return new Map(rows.map((row) => [row.id, row.locale ?? null]));
  }

  async isActive(userId: number): Promise<boolean> {
    // `find*` skips soft-deleted rows (User has a DeleteDateColumn).
    const user = await this.source()
      .getRepository(User)
      .findOne({ where: { id: userId }, select: { id: true, isDisabled: true } });
    return user !== null && !user.isDisabled;
  }

  async listIdsWithAnyPermission(permissionKeys: string[]): Promise<number[]> {
    if (permissionKeys.length === 0) return [];
    const rows = await this.source()
      .getRepository(UserRole)
      .createQueryBuilder('ur')
      .select('ur.userId', 'userId')
      .distinct(true)
      .innerJoin('ur.user', 'user', 'user.deletedAt IS NULL')
      .innerJoin('ur.role', 'role')
      .innerJoin('role.rolePermissions', 'rp')
      .where('rp.permissionKey IN (:...keys)', { keys: permissionKeys })
      .getRawMany<{ userId: number }>();
    return unique(rows.map((row) => Number(row.userId)));
  }
}

class SettingsDirectory implements PluginSettingsDirectory {
  constructor(private readonly source: () => DataSource) {}

  async getApp(key: string): Promise<string | null> {
    const row = await this.source().getRepository(Setting).findOneBy({ parent: 'app', key });
    const value = row?.value?.trim();
    return value ? value : null;
  }
}

function assertDataKey(key: string): string {
  if (!DATA_KEY.test(key)) throw new Error('Flow node data keys must be plain identifiers');
  return key;
}

function applyDataConditions(
  query: SelectQueryBuilder<ResourceFlowNode>,
  conditions: Pick<PluginFlowNodeQuery, 'dataEquals' | 'dataIn'>,
): void {
  let index = 0;
  for (const [key, value] of Object.entries(conditions.dataEquals ?? {})) {
    const name = `dataEq${index++}`;
    query.andWhere(`node.data ->> '${assertDataKey(key)}' = :${name}`, { [name]: value });
  }
  for (const [key, values] of Object.entries(conditions.dataIn ?? {})) {
    const name = `dataIn${index++}`;
    // An empty list matches nothing.
    if (values.length === 0) query.andWhere('1 = 0');
    else query.andWhere(`node.data ->> '${assertDataKey(key)}' IN (:...${name})`, { [name]: [...values] });
  }
}

class FlowDirectory implements PluginFlowDirectory {
  constructor(private readonly source: () => DataSource) {}

  async findNodes(query: PluginFlowNodeQuery): Promise<PluginFlowNodeReference[]> {
    const builder = this.source()
      .getRepository(ResourceFlowNode)
      .createQueryBuilder('node')
      .leftJoin('node.flow', 'flow')
      .leftJoin('node.resource', 'resource')
      .addSelect(['flow.id', 'flow.name', 'resource.id', 'resource.name']);
    if (query.type !== undefined) builder.andWhere('node.type = :type', { type: query.type });
    if (query.typePrefix !== undefined) {
      builder.andWhere("node.type LIKE :typePrefix ESCAPE '\\'", {
        typePrefix: `${query.typePrefix.replace(/[\\%_]/g, '\\$&')}%`,
      });
    }
    if (query.resourceId !== undefined)
      builder.andWhere('node.resourceId = :resourceId', { resourceId: query.resourceId });
    // NULL owner columns must be matched explicitly: `<>` skips them.
    if (query.excludeResourceId !== undefined) {
      builder.andWhere('(node.resourceId IS NULL OR node.resourceId <> :excludeResourceId)', {
        excludeResourceId: query.excludeResourceId,
      });
    }
    if (query.excludeFlowId !== undefined) {
      builder.andWhere('(node.flowId IS NULL OR node.flowId <> :excludeFlowId)', {
        excludeFlowId: query.excludeFlowId,
      });
    }
    applyDataConditions(builder, query);
    if (query.orderById) builder.orderBy('node.id', 'ASC');
    if (query.limit !== undefined) builder.take(query.limit);
    const nodes = await builder.getMany();
    return nodes.map((node) => ({
      id: node.id,
      type: String(node.type),
      resourceId: node.resourceId ?? null,
      resourceName: node.resource?.name ?? null,
      flowId: node.flowId ?? null,
      flowName: node.flow?.name ?? null,
      data: node.data ?? {},
    }));
  }
}

/** The TypeORM implementation of the plugin host data lookups. */
export function createPluginHostData(source: () => DataSource): PluginHostDataContext {
  return {
    resources: new ResourceDirectory(source),
    users: new UserDirectory(source),
    settings: new SettingsDirectory(source),
    flows: new FlowDirectory(source),
  };
}

/** Core-service lookups of the plugin runtime: the records core services expect for a plugin's authorization queries. */
export function createPluginCoreLookup(source: () => DataSource) {
  return {
    findUser: (userId: number) =>
      source()
        .getRepository(User)
        .findOne({ where: { id: userId } }),
    findRecipients: (userIds: number[]) =>
      source()
        .getRepository(User)
        .find({ where: { id: In(userIds) } }),
    findResourceSupervision: (resourceId: number) =>
      source()
        .getRepository(Resource)
        .findOne({ where: { id: resourceId }, select: { id: true, supervisionMode: true } }),
    listResourceIds: async () =>
      (
        await source()
          .getRepository(Resource)
          .find({ select: { id: true } })
      ).map((resource) => resource.id),
  };
}
