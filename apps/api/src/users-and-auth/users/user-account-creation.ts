import { User } from '@attraccess/database-entities';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { EntityManager, Not } from 'typeorm';
import { LicenseError } from '../../license/license.service';
import { UserIdentityNormalizationImplementation } from './user-identity-normalization';
export abstract class UserAccountCreationImplementation extends UserIdentityNormalizationImplementation {
  async createOne(
    userData: {
      username: string;
      email: string;
      externalIdentifier: string | null;
      isEmailVerified?: boolean;
      skipUsernameSanitization?: boolean;
      locale?: string;
      isFirstTimeSetupAdmin?: boolean;
    },
    manager?: EntityManager,
    options: { excludedUserIdFromLicenseUsage?: number } = {},
  ): Promise<User> {
    const data = {
      username: this.cleanupUsername(userData.username),
      email: userData.email.trim(),
      externalIdentifier: userData.externalIdentifier?.trim() ?? null,
      isEmailVerified: userData.isEmailVerified ?? false,
    };
    this.logger.debug(`Creating new user - username: ${data.username}, email: ${data.email}`);

    if (!userData.skipUsernameSanitization) {
      this.validateUsernameOrThrow(data.username);
    }

    // verifying usage limits
    const userRepository = manager ? manager.getRepository(User) : this.userRepository;
    const currentAmountOfUsers = await userRepository.count(
      options.excludedUserIdFromLicenseUsage === undefined
        ? undefined
        : { where: { id: Not(options.excludedUserIdFromLicenseUsage) } },
    );
    try {
      await this.licenseService.verifyLicense({
        usageLimits: {
          users: currentAmountOfUsers,
        },
      });
    } catch (error) {
      if (error instanceof LicenseError) {
        this.logger.warn(`Blocking user creation due to license: ${error.reason}`);
        throw new ForbiddenException(error.reason);
      }
      throw error;
    }

    // Check for existing email
    this.logger.debug(`Checking if email already exists: ${data.email}`);
    const existingEmail = await this.findOne({ email: data.email }, undefined, manager);
    if (existingEmail) {
      this.logger.debug(`Email already exists: ${data.email}`);
      throw new BadRequestException('Email already exists');
    }

    // Check for existing username
    this.logger.debug(`Checking if username already exists: ${data.username}`);
    const existingUsername = await this.findOne({ username: data.username }, undefined, manager);
    if (existingUsername) {
      this.logger.debug(`Username already exists: ${data.username}`);
      throw new BadRequestException('Username already exists');
    }

    const user = new User();
    user.username = data.username;
    user.email = data.email;
    user.externalIdentifier = data.externalIdentifier;
    user.isEmailVerified = data.isEmailVerified;
    if (userData.locale) {
      user.locale = userData.locale.trim() || 'en';
    }

    // Check if this is the first user in the system
    this.logger.debug('Checking if this is the first user in the system');
    const totalUsers = await userRepository.count();
    const isFirstUser = totalUsers === 0;

    this.logger.debug('Saving new user to database');
    // Wrap save + role assignment in a single transaction so a role-assignment failure
    // doesn't leave an administrator-less account on a fresh install.
    const saveUser = async (em: EntityManager) => {
      const saved = await em.save(user);
      if (isFirstUser || userData.isFirstTimeSetupAdmin) {
        this.logger.debug('First user in system - assigning administrator role');
        await this.rbacService.assignRoleByKey(saved.id, 'administrator', em);
      } else {
        await this.rbacService.assignDefaultRoles(saved.id, em);
      }
      return saved;
    };
    const savedUser = manager ? await saveUser(manager) : await this.dataSource.transaction(saveUser);
    this.logger.debug(`User saved with ID: ${savedUser.id}`);

    if (!manager) {
      this.recordCreatedUser(savedUser);
    }
    return savedUser;
  }

  public recordCreatedUser(user: User): void {
    this.metricsService.usersRegisteredTotal.inc();
    this.metricsService.usersTotal.inc();
    this.metricsService.usersPerLocale.inc({ locale: user.locale ?? 'en' });
  }

  public async rollbackFailedRegistration(userId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // This is only used for a just-created account whose verification email could not be sent.
      // It bypasses normal account-deletion rules so the first administrator can be retried.
      await manager.delete(User, userId);
    });
  }

  public async releaseFirstTimeSetupAdminIdentifiers(manager: EntityManager): Promise<User> {
    const repository = manager.getRepository(User);
    const [existingAdmin] = await repository.find({ take: 1 });
    if (!existingAdmin || existingAdmin.isEmailVerified) {
      throw new ForbiddenException('First-time setup is already complete');
    }

    const suffix = randomBytes(6).toString('base64url').slice(0, 8);
    // Claim the setup account only while it is the sole active account. The conditional
    // update is atomic across API instances, unlike an in-process mutex or count-then-update.
    const claim = await repository
      .createQueryBuilder()
      .update(User)
      .set({
        username: `first-time-setup-${existingAdmin.id}-${suffix}`,
        email: `first-time-setup-${existingAdmin.id}-${suffix}@deleted.local`,
      })
      .where('id = :id', { id: existingAdmin.id })
      .andWhere('isEmailVerified = :isEmailVerified', { isEmailVerified: false })
      .andWhere('NOT EXISTS (SELECT 1 FROM user AS other WHERE other.id != :id AND other.deletedAt IS NULL)')
      .execute();
    if (claim.affected !== 1) {
      throw new ForbiddenException('First-time setup is already complete');
    }

    return existingAdmin;
  }

  public async rollbackFirstTimeSetupAdminReplacement(replacementUserId: number, existingAdmin: User): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(User, replacementUserId);
      await manager.getRepository(User).update(existingAdmin.id, {
        username: existingAdmin.username,
        email: existingAdmin.email,
      });
    });
  }
}
