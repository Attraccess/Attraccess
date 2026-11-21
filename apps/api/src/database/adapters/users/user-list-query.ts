import { AuthenticationType, type UserListQuery } from '@attraccess/application-models';
import { AuthenticationDetail, User, UserRole } from '@attraccess/database-entities';
import { Brackets, SelectQueryBuilder } from 'typeorm';

/** Applies the joins and filters of the user listing that need a query builder (role and provider filters). */
export function applyUserListFilters(query: SelectQueryBuilder<User>, options: UserListQuery): void {
  query.leftJoinAndSelect('user.authenticationDetails', 'authenticationDetails');

  if (options.includeRoles) {
    query.leftJoinAndSelect('user.userRoles', 'userRoles').leftJoinAndSelect('userRoles.role', 'role');
  }

  if (options.ids) {
    query.andWhere('user.id IN (:...ids)', { ids: options.ids });
  }

  if (options.emailVerified !== undefined) {
    query.andWhere('user.isEmailVerified = :emailVerified', { emailVerified: options.emailVerified });
  }

  applyRoleFilters(query, options);
  applySsoFilters(query, options);

  if (options.search) {
    query.andWhere(
      new Brackets((where) =>
        where
          .where('LOWER(user.username) LIKE LOWER(:search)')
          .orWhere('LOWER(user.email) LIKE :emailSearch')
          .orWhere('LOWER(user.firstName) LIKE LOWER(:search)')
          .orWhere('LOWER(user.lastName) LIKE LOWER(:search)')
          .orWhere(`LOWER(${FULL_NAME_SQL}) LIKE LOWER(:search)`),
      ),
      // Emails are stored lower-cased, so the email term is trimmed and lower-cased like the stored value.
      { search: `%${options.search}%`, emailSearch: `%${options.search.trim().toLowerCase()}%` },
    );
  }
}

/** "First Last" of the user, as the display name joins it (null names and blanks are skipped). */
const FULL_NAME_SQL = `NULLIF(TRIM(CONCAT_WS(' ', user.firstName, user.lastName)), '')`;

/** The sort key of a user: the display name, case-insensitively. */
export const USER_DISPLAY_NAME_SORT_SQL = `LOWER(COALESCE(${FULL_NAME_SQL}, user.username))`;

function applyRoleFilters(query: SelectQueryBuilder<User>, options: UserListQuery): void {
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

function applySsoFilters(query: SelectQueryBuilder<User>, options: UserListQuery): void {
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

  const excludeSsoProviderIds = options.excludeSsoProviderIds ? [...new Set(options.excludeSsoProviderIds)] : undefined;
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
