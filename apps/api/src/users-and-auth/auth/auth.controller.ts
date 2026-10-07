import { Controller, Optional } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IdentityAuditService } from '../../audit/identity-audit.service';
import { CookieConfigService } from '../../common/services/cookie-config.service';
import { AuthSessionEndRoutesImplementation } from './auth-session-end.routes';
import { SessionService } from './session.service';
import { installInheritedMethods } from '../../common/inherited-implementation';

@ApiTags('Authentication')
@Controller('/auth')
export class AuthController extends AuthSessionEndRoutesImplementation {
  constructor(
    protected readonly sessionService: SessionService,
    protected readonly cookieConfigService: CookieConfigService,
    @Optional() protected readonly identityAudit?: IdentityAuditService,
  ) {
    super();
  }
}
installInheritedMethods(AuthController, ['createSession', 'refreshSession', 'endSession']);
