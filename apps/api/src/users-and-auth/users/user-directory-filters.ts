import { AuthenticationDetail, AuthenticationType, User, UserRole } from '@attraccess/database-entities';
import { Brackets, SelectQueryBuilder } from 'typeorm';
import { UserProfileWritingImplementation } from './user-profile-writing';
import { UserListOptions } from './users.service.feature-definitions';
export abstract class UserDirectoryFiltersImplementation extends UserProfileWritingImplementation {
  protected applyRoleFilters(query: SelectQueryBuilder<User>, options: UserListOptions): void {
    const requestedRoleIds = options.roleIds ?? (options.roleId === undefined ? undefined : [options.roleId]);
    const roleIds = requestedRoleIds ? [...new Set(requestedRoleIds)] : undefined;
    if (roleIds?.length) {
      const roleFilter = query
        .subQuery()
        .select('userRole.userId')
        .from(UserRole, 'userRole')
        .where('userRole.roleId IN (:...roleIds)');

      if (options.roleMatch === 'all') {
        roleFilter.groupBy('userRole.userId').having('COUNT(DISTINCT userRole.roleId) = :roleCount');
        query.andWhere(`user.id IN ${roleFilter.getQuery()}`, { roleIds, roleCount: roleIds.length });
      } else {
        query.andWhere(`user.id IN ${roleFilter.getQuery()}`, { roleIds });
      }
    }

    const excludeRoleIds = options.excludeRoleIds ? [...new Set(options.excludeRoleIds)] : undefined;
    if (excludeRoleIds?.length) {
      const excludedRoles = query
        .subQuery()
        .select('1')
        .from(UserRole, 'excludedUserRole')
        .where('excludedUserRole.userId = user.id')
        .andWhere('excludedUserRole.roleId IN (:...excludeRoleIds)');
      query.andWhere(`NOT EXISTS ${excludedRoles.getQuery()}`, { excludeRoleIds });
    }
  }

  protected applySsoFilters(query: SelectQueryBuilder<User>, options: UserListOptions): void {
    const ssoProviderIds = options.ssoProviderIds ? [...new Set(options.ssoProviderIds)] : undefined;
    if (ssoProviderIds?.length || options.ssoProviderNone) {
      const noSsoProvider = query
        .subQuery()
        .select('1')
        .from(AuthenticationDetail, 'ssoDetail')
        .where('ssoDetail.userId = user.id')
        .andWhere('ssoDetail.type = :ssoType')
        .getQuery();
      const ssoProviders = ssoProviderIds?.length
        ? query
            .subQuery()
            .select('ssoDetail.userId')
            .from(AuthenticationDetail, 'ssoDetail')
            .where('ssoDetail.userId = user.id')
            .andWhere('ssoDetail.type = :ssoType')
            .andWhere('ssoDetail.providerId IN (:...ssoProviderIds)')
        : undefined;

      if (ssoProviders && options.ssoProviderMatch === 'all') {
        ssoProviders.groupBy('ssoDetail.userId').having('COUNT(DISTINCT ssoDetail.providerId) = :ssoProviderCount');
      }

      if (ssoProviders && options.ssoProviderNone && options.ssoProviderMatch !== 'all') {
        query.andWhere(
          new Brackets((where) =>
            where.where(`user.id IN ${ssoProviders.getQuery()}`).orWhere(`NOT EXISTS ${noSsoProvider}`),
          ),
        );
      } else if (ssoProviders) {
        query.andWhere(`user.id IN ${ssoProviders.getQuery()}`);
        if (options.ssoProviderNone) {
          query.andWhere(`NOT EXISTS ${noSsoProvider}`);
        }
      } else {
        query.andWhere(`NOT EXISTS ${noSsoProvider}`);
      }

      query.setParameters({
        ssoType: AuthenticationType.SSO,
        ...(ssoProviderIds?.length ? { ssoProviderIds, ssoProviderCount: ssoProviderIds.length } : {}),
      });
    }

    if (options.hasSsoProvider !== undefined) {
      const ssoProviderExists = query
        .subQuery()
        .select('1')
        .from(AuthenticationDetail, 'anySsoDetail')
        .where('anySsoDetail.userId = user.id')
        .andWhere('anySsoDetail.type = :anySsoType');
      query.andWhere(`${options.hasSsoProvider ? 'EXISTS' : 'NOT EXISTS'} ${ssoProviderExists.getQuery()}`, {
        anySsoType: AuthenticationType.SSO,
      });
    }

    const excludeSsoProviderIds = options.excludeSsoProviderIds
      ? [...new Set(options.excludeSsoProviderIds)]
      : undefined;
    if (excludeSsoProviderIds?.length) {
      const excludedSsoProviders = query
        .subQuery()
        .select('1')
        .from(AuthenticationDetail, 'excludedSsoDetail')
        .where('excludedSsoDetail.userId = user.id')
        .andWhere('excludedSsoDetail.type = :excludedSsoType')
        .andWhere('excludedSsoDetail.providerId IN (:...excludeSsoProviderIds)');
      query.andWhere(`NOT EXISTS ${excludedSsoProviders.getQuery()}`, {
        excludedSsoType: AuthenticationType.SSO,
        excludeSsoProviderIds,
      });
    }
  }
}
