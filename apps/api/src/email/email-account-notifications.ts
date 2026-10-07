import { EmailTemplateType, User } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { EmailTransportImplementation } from './email-transport';
export abstract class EmailAccountNotificationsImplementation extends EmailTransportImplementation {
  async sendVerificationEmail(user: User, verificationToken: string) {
    const url = await this.settingsService.getUrl();
    if (!url) throw new Error('Application URL not configured');
    const verificationUrl = `${url}/verify-email?email=${encodeURIComponent(user.email)}&token=${verificationToken}`;

    const context = {
      ...(await this.getBaseContext(user)),
      url: verificationUrl,
    };

    await this.sendEmail(user, EmailTemplateType.VERIFY_EMAIL, context);
  }

  async sendUserInvitationEmail(user: User, verificationToken: string, manager?: EntityManager) {
    const url = await this.settingsService.getUrl();
    if (!url) throw new Error('Application URL not configured');
    const verificationUrl = `${url}/accept-invitation?email=${encodeURIComponent(
      user.email,
    )}&token=${verificationToken}`;

    const context = {
      ...(await this.getBaseContext(user)),
      url: verificationUrl,
    };

    await this.sendEmail(user, EmailTemplateType.USER_INVITATION, context, manager);
  }

  async sendPasswordResetEmail(user: User, resetToken: string) {
    const url = await this.settingsService.getUrl();
    if (!url) throw new Error('Application URL not configured');
    const resetUrl = `${url}/reset-password?userId=${user.id}&token=${encodeURIComponent(resetToken)}`;

    const context = {
      ...(await this.getBaseContext(user)),
      url: resetUrl,
    };

    await this.sendEmail(user, EmailTemplateType.RESET_PASSWORD, context);
  }

  async sendDeleteAccountConfirmationEmail(user: User, token: string) {
    const url = await this.settingsService.getUrl();
    if (!url) throw new Error('Application URL not configured');
    const confirmUrl = `${url}/confirm-delete-account?email=${encodeURIComponent(
      user.email,
    )}&token=${encodeURIComponent(token)}`;

    const context = {
      ...(await this.getBaseContext(user)),
      url: confirmUrl,
    };

    await this.sendEmail(user, EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION, context);
  }

  async sendUsernameChangedEmail(user: User, previousUsername: string) {
    const base = (await this.getBaseContext(user)) as unknown as {
      user: { username: string; email: string; id: number };
      host: { frontend: string; backend: string };
      url: string;
    };

    const context = {
      ...base,
      user: {
        ...base.user,
        previousUsername,
        newUsername: user.username,
      },
    };

    await this.sendEmail(user, EmailTemplateType.USERNAME_CHANGED, context);
  }

  async sendPasswordChangedEmail(user: User) {
    const context = await this.getBaseContext(user);
    await this.sendEmail(user, EmailTemplateType.PASSWORD_CHANGED, context);
  }
}
