import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Repository, ILike, FindOneOptions as TypeormFindOneOptions, FindOptionsWhere, In } from 'typeorm';
import { SystemPermissions, User } from '@attraccess/database-entities';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginatedResponse } from '../../types/response';
import { PaginationOptions, PaginationOptionsSchema } from '../../types/request';
import { z } from 'zod';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';

const FindOneOptionsSchema = z
  .object({
    id: z.number(),
    username: z.string().min(1),
    email: z.string().email(),
    externalIdentifier: z.string().optional(),
  })
  .partial()
  .refine((data) => Object.values(data).filter((val) => val !== undefined).length > 0, {
    message: 'At least one search criteria must be provided',
  });

type FindOneOptions = z.infer<typeof FindOneOptionsSchema>;

class UserEmailAlreadyInUseException extends BadRequestException {
  constructor() {
    super('UserEmailAlreadyInUseException');
  }
}

class UserUsernameAlreadyInUseException extends BadRequestException {
  constructor() {
    super('UserUsernameAlreadyInUseException');
  }
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>
  ) {}

  async findOne(options: FindOneOptions, relations?: string[]): Promise<User | null> {
    const validatedOptions = FindOneOptionsSchema.parse(options);

    // Build a where condition that uses case-insensitive comparison for username
    const whereCondition: TypeormFindOneOptions<User>['where'] = {};

    if (validatedOptions.id !== undefined) {
      whereCondition.id = validatedOptions.id;
    }

    if (validatedOptions.username !== undefined) {
      whereCondition.username = ILike(validatedOptions.username);
    }

    if (validatedOptions.email !== undefined) {
      whereCondition.email = validatedOptions.email;
    }

    if (validatedOptions.externalIdentifier !== undefined) {
      whereCondition.externalIdentifier = validatedOptions.externalIdentifier;
    }

    const user = await this.userRepository.findOne({
      where: whereCondition,
      relations,
    });

    return user || null;
  }

  async createOne(data: { username: string; email: string; externalIdentifier: string | null }): Promise<User> {
    this.logger.debug(`Creating new user - username: ${data.username}, email: ${data.email}`);

    // Check for existing email
    this.logger.debug(`Checking if email already exists: ${data.email}`);
    const existingEmail = await this.findOne({ email: data.email });
    if (existingEmail) {
      this.logger.debug(`Email already exists: ${data.email}`);
      throw new BadRequestException('Email already exists');
    }

    // Check for existing username
    this.logger.debug(`Checking if username already exists: ${data.username}`);
    const existingUsername = await this.findOne({ username: data.username });
    if (existingUsername) {
      this.logger.debug(`Username already exists: ${data.username}`);
      throw new BadRequestException('Username already exists');
    }

    const user = new User();
    user.username = data.username;
    user.email = data.email;
    user.externalIdentifier = data.externalIdentifier;

    // Check if this is the first user in the system
    this.logger.debug('Checking if this is the first user in the system');
    const totalUsers = await this.userRepository.count();
    if (totalUsers === 0) {
      this.logger.debug('First user in system - granting all system permissions');
      // This is the first user, grant all system permissions
      type permissionKeys = keyof SystemPermissions;

      const permissions: Record<permissionKeys, true> = {
        canManageResources: true,
        canManageSystemConfiguration: true,
        canManageUsers: true,
      };

      user.systemPermissions = permissions;
    }

    this.logger.debug('Saving new user to database');
    const savedUser = await this.userRepository.save(user);
    this.logger.debug(`User saved with ID: ${savedUser.id}`);
    return savedUser;
  }

  async deleteOne(id: number): Promise<void> {
    this.logger.debug(`Deleting user with ID: ${id}`);
    await this.userRepository.delete(id);
    this.logger.debug(`User deleted with ID: ${id}`);
  }

  async updateOne(id: number, updates: Partial<User>): Promise<User> {
    this.logger.debug(`Updating user with ID: ${id}, updates: ${JSON.stringify(updates)}`);

    // If email is being updated, check for uniqueness
    if (updates.email) {
      this.logger.debug(`Checking uniqueness for new email: ${updates.email}`);
      const existingEmails = await this.userRepository.find({
        where: { email: updates.email },
      });

      if (existingEmails.some((user) => user.id !== id)) {
        this.logger.debug(`Email already in use by another user: ${updates.email}`);
        throw new UserEmailAlreadyInUseException();
      }
    }

    // If username is being updated, check for case-insensitive uniqueness
    if (updates.username) {
      this.logger.debug(`Checking uniqueness for new username: ${updates.username}`);
      const existingUsername = await this.findOne({
        username: updates.username,
      });
      if (existingUsername && existingUsername.id !== id) {
        this.logger.debug(`Username already in use by another user: ${updates.username}`);
        throw new UserUsernameAlreadyInUseException();
      }
    }

    this.logger.debug(`Performing update for user ID: ${id}`);
    await this.userRepository.update(id, updates);

    this.logger.debug(`Fetching updated user from database, ID: ${id}`);
    const updatedUser = await this.findOne({ id });
    if (!updatedUser) {
      this.logger.error(`User not found after update, ID: ${id}`);
      throw new UserNotFoundException(id);
    }

    this.logger.debug(`User updated successfully, ID: ${id}`);
    return updatedUser;
  }

  async findMany(options: PaginationOptions & { search?: string; ids?: number[] }): Promise<PaginatedResponse<User>> {
    this.logger.debug(`Finding all users with options: ${JSON.stringify(options)}`);
    const paginationOptions = PaginationOptionsSchema.parse(options);
    const { search } = options;
    const { page, limit } = paginationOptions;
    const skip = (page - 1) * limit;

    let whereCondition: FindOptionsWhere<User>[] | FindOptionsWhere<User> = {};

    if (Array.isArray(options.ids)) {
      if (options.ids.length === 0) {
        return {
          data: [],
          total: 0,
          page: paginationOptions.page,
          limit: paginationOptions.limit,
        };
      }

      whereCondition = { id: In(options.ids) };
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
    });

    this.logger.debug(`Found ${total} total users, returning page ${page} with ${users.length} results`);
    return {
      data: users,
      total,
      page: paginationOptions.page,
      limit: paginationOptions.limit,
    };
  }

  async findByPermission(
    permission: keyof SystemPermissions,
    options: PaginationOptions & { search?: string }
  ): Promise<PaginatedResponse<User>> {
    this.logger.debug(`Finding users with permission "${permission}" and options: ${JSON.stringify(options)}`);
    const paginationOptions = PaginationOptionsSchema.parse(options);
    const { search } = options;
    const { page, limit } = paginationOptions;
    const skip = (page - 1) * limit;

    // Create a query to find users with the specified permission
    const query = this.userRepository.createQueryBuilder('user');

    // Add where clause for the specific permission = true
    query.where(`user.systemPermissions${permission.charAt(0).toUpperCase() + permission.slice(1)} = :value`, {
      value: true,
    });

    // Add search clause if provided
    if (search) {
      this.logger.debug(`Searching for users with query: ${search}`);
      query.andWhere('(user.username LIKE :search OR user.email LIKE :search)', {
        search: `%${search}%`,
      });
    }

    // Add pagination
    query.skip(skip).take(limit);

    // Execute the query
    this.logger.debug(`Executing query for users with permission "${permission}"`);
    const [users, total] = await query.getManyAndCount();

    this.logger.debug(
      `Found ${total} total users with permission "${permission}", returning page ${page} with ${users.length} results`
    );
    return {
      data: users,
      total,
      page: paginationOptions.page,
      limit: paginationOptions.limit,
    };
  }
}
