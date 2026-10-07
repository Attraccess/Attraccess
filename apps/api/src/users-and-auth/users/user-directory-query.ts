import { User } from '@attraccess/database-entities';
import { Brackets, FindOptionsWhere, ILike, In } from 'typeorm';
import { PaginationOptionsSchema } from '../../types/request';
import { PaginatedResponse } from '../../types/response';
import { UserDirectoryFiltersImplementation } from './user-directory-filters';
import { UserListOptions } from './users.service.feature-definitions';
export abstract class UserDirectoryQueryImplementation extends UserDirectoryFiltersImplementation {
  async findMany(options: UserListOptions): Promise<PaginatedResponse<User>> {
    this.logger.debug(`Finding all users with options: ${JSON.stringify(options)}`);
    const paginationOptions = PaginationOptionsSchema.parse(options);
    const { search } = options;
    const { page, limit } = paginationOptions;
    const skip = (page - 1) * limit;

    if (Array.isArray(options.ids) && options.ids.length === 0) {
      return {
        data: [],
        total: 0,
        page: paginationOptions.page,
        limit: paginationOptions.limit,
      };
    }

    const hasAdvancedFilters =
      options.roleIds !== undefined ||
      options.excludeRoleIds !== undefined ||
      options.emailVerified !== undefined ||
      options.ssoProviderIds !== undefined ||
      options.excludeSsoProviderIds !== undefined ||
      options.ssoProviderNone !== undefined ||
      options.hasSsoProvider !== undefined;

    if (hasAdvancedFilters) {
      const query = this.userRepository.createQueryBuilder('user');
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

      this.applyRoleFilters(query, options);

      this.applySsoFilters(query, options);

      if (search) {
        this.logger.debug(`Searching for users with query: ${search}`);
        query.andWhere(
          new Brackets((where) =>
            where.where('LOWER(user.username) LIKE LOWER(:search)').orWhere('LOWER(user.email) LIKE LOWER(:search)'),
          ),
          { search: `%${search}%` },
        );
      }

      const [users, total] = await query.orderBy('user.username', 'ASC').skip(skip).take(limit).getManyAndCount();
      return { data: users, total, page, limit };
    }

    let whereCondition: FindOptionsWhere<User>[] | FindOptionsWhere<User> = {};

    if (Array.isArray(options.ids)) {
      whereCondition = { id: In(options.ids) };
    }

    if (options.roleId !== undefined) {
      whereCondition = { ...whereCondition, userRoles: { roleId: options.roleId } };
    }

    if (search) {
      this.logger.debug(`Searching for users with query: ${search}`);
      whereCondition = [
        { ...whereCondition, username: ILike(`%${search}%`) },
        { ...whereCondition, email: ILike(`%${search}%`) },
      ];
    }

    this.logger.debug(`Executing find with skip: ${skip}, take: ${limit}`);
    const [users, total] = await this.userRepository.findAndCount({
      skip,
      take: limit,
      where: whereCondition,
      relations: options.includeRoles
        ? ['authenticationDetails', 'userRoles', 'userRoles.role']
        : ['authenticationDetails'],
      order: { username: 'ASC' },
    });

    this.logger.debug(`Found ${total} total users, returning page ${page} with ${users.length} results`);
    return {
      data: users,
      total,
      page: paginationOptions.page,
      limit: paginationOptions.limit,
    };
  }
}
