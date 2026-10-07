import { IdentityAuditService } from '../../audit/identity-audit.service';
import { CookieConfigService } from '../../common/services/cookie-config.service';
import { SessionService } from './session.service';
export abstract class AuthControllerRouteContext {
  protected abstract readonly sessionService: SessionService;
  protected abstract readonly cookieConfigService: CookieConfigService;
  protected abstract readonly identityAudit?: IdentityAuditService;
}
