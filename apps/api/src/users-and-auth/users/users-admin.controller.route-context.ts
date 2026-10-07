import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { IdentityAuditService } from '../../audit/identity-audit.service';
import { UserPasswordService } from './user-password.service';
import { UsersService } from './users.service';

export abstract class UsersAdminControllerRouteContext {
  protected abstract readonly passwordService: UserPasswordService;
  protected abstract record(
    action: 'user_deleted' | 'user_updated',
    subjectId: number,
    request: AuthenticatedRequest,
    field?: 'username' | 'email' | 'password' | 'billingFactor',
  ): Promise<void>;
  protected abstract readonly usersService: UsersService;
  protected abstract readonly identityAudit?: IdentityAuditService;
}
