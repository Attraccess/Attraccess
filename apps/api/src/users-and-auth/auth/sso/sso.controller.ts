import { Controller, Logger, Optional } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IdentityAuditService } from '../../../audit/identity-audit.service';
import { SsoAuditService } from '../../../audit/sso-audit.service';
import { CookieConfigService } from '../../../common/services/cookie-config.service';
import { LicenseModuleType } from '../../../license/license.service';
import { RequiresLicense } from '../../../license/require-license.decorator';
import { MetricsService } from '../../../metrics/metrics.service';
import { SettingsService } from '../../../settings/settings.service';
import { RbacService } from '../../rbac/rbac.service';
import { UsersService } from '../../users/users.service';
import { AuthService } from '../auth.service';
import { SessionService } from '../session.service';
import { SSOLinkTokenService } from './link-token.service';
import { SsoProviderAuditImplementation } from './sso-provider-audit';
import { SSOService } from './sso.service';
import { installInheritedMethods } from '../../../common/inherited-implementation';

@ApiTags('Authentication')
@Controller('auth/sso')
@RequiresLicense(LicenseModuleType.SSO)
export class SSOController extends SsoProviderAuditImplementation {
  protected readonly logger = new Logger(SSOController.name);

  constructor(
    protected readonly authService: AuthService,
    protected readonly sessionService: SessionService,
    protected readonly usersService: UsersService,
    protected readonly ssoService: SSOService,
    protected readonly cookieConfigService: CookieConfigService,
    protected readonly linkTokenService: SSOLinkTokenService,
    protected readonly settingsService: SettingsService,
    protected readonly metricsService: MetricsService,
    protected readonly rbacService: RbacService,
    @Optional() protected readonly identityAudit?: IdentityAuditService,
    @Optional() protected readonly ssoAudit?: SsoAuditService,
  ) {
    super();
  }

  // Per-role ceiling: each mapped role must have permissions that are a subset of the actor's own
}
installInheritedMethods(SSOController, [
  'getAll',
  'linkUserToExternalAccount',
  'getOneById',
  'createOne',
  'updateOne',
  'deleteOne',
  'discoverAuthentik',
  'discoverKeycloak',
  'oidcLogout',
  'samlLogout',
  'oidcDeleteUser',
  'samlDeleteUser',
  'oidcUpdatePermissions',
  'samlUpdatePermissions',
  'loginWithOidc',
  'oidcLoginCallback',
  'loginWithSaml',
  'samlLoginCallback',
  'finalizeLogin',
  'parseProviderId',
  'extractProvisioningToken',
  'assertProvisioningAuthorized',
  'loadProvisioningProvider',
  'resolveProvisioningUser',
  'assertPermissionMappingCeiling',
  'applyProvisioningPermissions',
  'recordProviderAudit',
  'recordProvisioningAudit',
  'recordSso',
  'providerSnapshot',
  'providerChanges',
  'providerRotationFlags',
]);
