import { SsoAccountLinkService } from './account-linking/sso-account-link.service';
import { SsoProviderAdministrationService } from './providers/provider-administration.service';
import { SsoProvisioningService } from './provisioning/sso-provisioning.service';
import { SsoIpThrottleService } from './sso-ip-throttle.service';
import { SsoLoginService } from './sso-login.service';

/** The services SSOController translates HTTP requests into; provided wherever the controller is. */
export const SSO_CONTROLLER_SERVICES = [
  SsoProviderAdministrationService,
  SsoProvisioningService,
  SsoAccountLinkService,
  SsoLoginService,
  SsoIpThrottleService,
];
