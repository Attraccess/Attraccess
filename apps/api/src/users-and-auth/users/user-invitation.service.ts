import { User } from '@attraccess/database-entities';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { EmailService } from '../../email/email.service';
import { AuthService } from '../auth/auth.service';
import { InviteUserDto } from './dtos/inviteUser.dto';
import { mapEmailSendError } from './email-send-error.util';
import { InvitationCsvImportImplementation } from './invitation-csv-import';
import { UsersService } from './users.service';

/**
 * Single and bulk (CSV) user invitations, including CSV parsing/validation and
 * the transactional create-and-invite flow.
 */
@Injectable()
export class UserInvitationService extends InvitationCsvImportImplementation {
  protected readonly logger = new Logger(UserInvitationService.name);

  constructor(
    protected readonly usersService: UsersService,
    @Inject(forwardRef(() => AuthService))
    protected readonly authService: AuthService,
    protected readonly emailService: EmailService,
  ) {
    super();
  }

  protected async inviteUsersTransactional(
    candidates: Array<{ username: string; email: string; locale?: string; roleKey?: string }>,
    options?: { grantAllPermissionsToFirst?: boolean; actorId?: number },
  ): Promise<User[]> {
    await this.usersService.ensureLicenseForNewUsers(candidates.length);

    return this.usersService
      .withTransaction(async (manager: EntityManager) => {
        const createdUsers = await this.usersService.createMany(candidates, {
          grantAllPermissionsToFirst: options?.grantAllPermissionsToFirst ?? false,
          manager,
          actorId: options?.actorId,
        });

        for (const user of createdUsers) {
          const verificationToken = await this.authService.generateEmailVerificationToken(user, manager);
          await this.emailService.sendUserInvitationEmail(user, verificationToken, manager);
        }

        return createdUsers;
      })
      .catch((error) => mapEmailSendError(error));
  }

  public async inviteUser(body: InviteUserDto, adminLocale?: string): Promise<User> {
    try {
      const [invited] = await this.inviteUsersTransactional(
        [{ username: body.username, email: body.email, locale: adminLocale }],
        { grantAllPermissionsToFirst: true },
      );

      return invited;
    } catch (error) {
      throw mapEmailSendError(error);
    }
  }
}
