import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { NETWORK_RESTRICTED_ACTIONS, NetworkRestrictedAction } from '@attraccess/application-models';
import { Role, RoleNetworkAction, UserRole } from '@attraccess/database-entities';
import { DataSource, In, Repository } from 'typeorm';
import type {
  NetworkRestrictionStore,
  RoleNetworkActionsRecord,
} from '../../../network-restriction/network-restriction.port';

const known = (action: string): action is NetworkRestrictedAction =>
  (NETWORK_RESTRICTED_ACTIONS as readonly string[]).includes(action);

@Injectable()
export class TypeOrmNetworkRestrictionStore implements NetworkRestrictionStore {
  constructor(
    @InjectRepository(RoleNetworkAction) private readonly entries: Repository<RoleNetworkAction>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(UserRole) private readonly userRoles: Repository<UserRole>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async listRoleActions() {
    const [roles, entries] = await Promise.all([this.roles.find({ order: { id: 'ASC' } }), this.entries.find()]);
    return roles.map((role) => ({
      roleId: role.id,
      key: role.key,
      name: role.name,
      actions: entries
        .filter((entry) => entry.roleId === role.id && known(entry.action))
        .map((e) => e.action as NetworkRestrictedAction),
    }));
  }

  async actionsAllowedForUser(userId: number): Promise<NetworkRestrictedAction[]> {
    const rows = await this.entries
      .createQueryBuilder('entry')
      .select('DISTINCT entry.action', 'action')
      .innerJoin(UserRole, 'assignment', 'assignment.roleId = entry.roleId')
      .where('assignment.userId = :userId', { userId })
      .getRawMany<{ action: string }>();
    return rows.map((row) => row.action).filter(known);
  }

  async existingRoleIds(roleIds: number[]): Promise<number[]> {
    if (roleIds.length === 0) return [];
    return (await this.roles.find({ select: { id: true }, where: { id: In(roleIds) } })).map((role) => role.id);
  }

  async replaceRoleActions(entries: RoleNetworkActionsRecord[]): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(RoleNetworkAction);
      for (const { roleId, actions } of entries) {
        await repository.delete({ roleId });
        if (actions.length > 0) await repository.insert(actions.map((action) => ({ roleId, action })));
      }
    });
  }
}
