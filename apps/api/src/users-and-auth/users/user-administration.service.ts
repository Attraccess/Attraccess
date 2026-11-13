import { User } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { identityAuditEvent } from '../../audit/policies/identity';
import { AUDIT_RECORDER, AuditOrigin, AuditRecorder } from '../../audit/recorder/audit-event';
import { SetUserPasswordDto } from './dtos/setUserPassword.dto';
import { UserPasswordService } from './user-password.service';
import { UsersService } from './users.service';

/** Changes an administrator makes to another user's account, and their identity audit. */
@Injectable()
export class UserAdministrationService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: UserPasswordService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async deleteUser(id: number, origin: AuditOrigin): Promise<void> {
    await this.usersService.deleteOne(id);
    await this.record('user_deleted', id, origin);
  }

  async setPassword(id: number, body: SetUserPasswordDto, actor: AuthenticatedUser, origin: AuditOrigin) {
    await this.passwordService.setUserPassword(id, body, actor);
    await this.record('user_updated', id, origin, 'password');
  }

  async changeUsername(id: number, username: string, actor: AuthenticatedUser, origin: AuditOrigin): Promise<User> {
    const user = await this.usersService.changeUsername(id, username, actor);
    await this.record('user_updated', id, origin, 'username');
    return user;
  }

  async changeEmail(id: number, email: string, actor: AuthenticatedUser, origin: AuditOrigin): Promise<User> {
    const user = await this.usersService.changeEmail(id, email, actor);
    await this.record('user_updated', id, origin, 'email');
    return user;
  }

  async changeBillingFactor(id: number, billingFactor: number, origin: AuditOrigin): Promise<User> {
    const user = await this.usersService.changeBillingFactor(id, billingFactor);
    await this.record('user_updated', id, origin, 'billingFactor');
    return user;
  }

  private async record(
    action: 'user_deleted' | 'user_updated',
    userId: number,
    origin: AuditOrigin,
    field?: 'username' | 'email' | 'password' | 'billingFactor',
  ): Promise<void> {
    await this.audit.record(identityAuditEvent(action, origin, { id: userId }, field ? { field } : {}));
  }
}
