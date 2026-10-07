import { User } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { CreateUserDto } from './dtos/createUser.dto';
import { mapEmailSendError } from './email-send-error.util';
import { UserRegistrationServiceRouteContext } from './user-registration.service.route-context';
export abstract class UserAccountRegistrationImplementation extends UserRegistrationServiceRouteContext {
  protected async registerUser(
    body: CreateUserDto,
    locale: string | undefined,
    hashedPassword: string | undefined,
    overwriteFirstTimeAdmin: boolean | undefined,
  ): Promise<User> {
    let existingAdmin: User | undefined;

    const { user, verificationToken } = await this.usersService.withTransaction(async (manager: EntityManager) => {
      existingAdmin = overwriteFirstTimeAdmin
        ? await this.usersService.releaseFirstTimeSetupAdminIdentifiers(manager)
        : undefined;
      const user = await this.usersService.createOne(
        {
          username: body.username,
          email: body.email,
          externalIdentifier: null,
          locale,
          isFirstTimeSetupAdmin: !!existingAdmin,
        },
        manager,
        { excludedUserIdFromLicenseUsage: existingAdmin?.id },
      );
      this.logger.debug(`User created with ID: ${user.id}`);

      this.logger.debug(`Adding authentication details for user ID: ${user.id}, strategy: ${body.strategy}`);
      const authenticationDetails = await this.authService.addAuthenticationDetails(
        user.id,
        {
          type: body.strategy,
          details: {
            password: body.password,
          },
        },
        manager,
        hashedPassword,
      );
      this.logger.debug(`Authentication details added with ID: ${authenticationDetails.id}`);

      this.logger.debug(`Generating email verification token for user ID: ${user.id}`);
      const verificationToken = await this.authService.generateEmailVerificationToken(user, manager);
      return { user, verificationToken };
    });

    try {
      this.logger.debug(`Sending verification email to user ID: ${user.id}`);
      await this.emailService.sendVerificationEmail(user, verificationToken);
      this.logger.debug(`Verification email sent to user ID: ${user.id}`);
    } catch (error) {
      this.logger.error(
        `Error sending verification email for ${body.email}`,
        error instanceof Error ? error.stack : String(error),
      );
      try {
        if (existingAdmin) {
          await this.usersService.rollbackFirstTimeSetupAdminReplacement(user.id, existingAdmin);
        } else {
          await this.usersService.rollbackFailedRegistration(user.id);
        }
      } catch (rollbackError) {
        this.logger.error(
          `Error rolling back failed registration for user ID: ${user.id}`,
          rollbackError instanceof Error ? rollbackError.stack : String(rollbackError),
        );
        throw rollbackError;
      }
      throw mapEmailSendError(error);
    }

    if (existingAdmin) {
      this.logger.debug(`Overwriting first-time-setup admin with ID: ${existingAdmin.id}`);
      try {
        await this.usersService.deleteOne(existingAdmin.id);
      } catch (error) {
        try {
          await this.usersService.rollbackFirstTimeSetupAdminReplacement(user.id, existingAdmin);
        } catch (rollbackError) {
          this.logger.error(
            `Error rolling back failed first-time-setup replacement for user ID: ${user.id}`,
            rollbackError instanceof Error ? rollbackError.stack : String(rollbackError),
          );
          throw rollbackError;
        }
        throw error;
      }
    }

    this.usersService.recordCreatedUser(user);
    this.logger.debug(`User creation completed successfully for ID: ${user.id}`);
    return user;
  }

  protected async withFirstTimeSetupOverwriteLock<T>(handler: () => Promise<T>): Promise<T> {
    const previous = this.firstTimeSetupOverwriteLock;
    let release!: () => void;
    this.firstTimeSetupOverwriteLock = new Promise((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await handler();
    } finally {
      release();
    }
  }
}
