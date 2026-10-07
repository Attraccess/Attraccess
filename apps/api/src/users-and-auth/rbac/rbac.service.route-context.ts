import { Permission, Role, RolePermission, User, UserRole } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';

export abstract class RbacServiceRouteContext {
  protected abstract readonly roleRepository: Repository<Role>;
  protected abstract readonly userRoleRepository: Repository<UserRole>;
  protected abstract readonly permissionRepository: Repository<Permission>;
  protected abstract resolvePermissionKeys(keys: string[]): Promise<string[]>;
  protected abstract assertActorHolds(actorPermissions: Set<string>, keys: string[], action: 'grant' | 'revoke'): void;
  protected abstract generateRoleKey(name: string): Promise<string>;
  protected abstract readonly rolePermissionRepository: Repository<RolePermission>;
  protected abstract countAdministratorEquivalentUsers(
    excludeRoleId?: number,
    manager?: EntityManager,
  ): Promise<number>;
  protected abstract readonly permissionsCache: Map<number, { permissions: Set<string>; ts: number }>;
  protected abstract permissionsChanged(userId?: number): Promise<void>;
  protected abstract readonly userRepository: Repository<User>;
  protected abstract syncSsoRolesInTransaction(
    userId: number,
    roles: Array<{ roleKey: string; externalValue?: string | null }>,
    ssoProviderType: string,
    ssoProviderId: number,
    userRoleRepository: Repository<UserRole>,
    roleRepository: Repository<Role>,
  ): Promise<{ added: string[]; removed: string[]; updated: string[] }>;
  protected abstract readonly logger: Logger;
}
