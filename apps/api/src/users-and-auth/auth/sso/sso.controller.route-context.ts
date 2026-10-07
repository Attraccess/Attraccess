import { SSOProvider, SSOProviderType } from '@attraccess/database-entities';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { IdentityAuditService } from '../../../audit/identity-audit.service';
import { SsoAuditService } from '../../../audit/sso-audit.service';
import { CookieConfigService } from '../../../common/services/cookie-config.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { SettingsService } from '../../../settings/settings.service';
import { RbacService } from '../../rbac/rbac.service';
import { UsersService } from '../../users/users.service';
import { AuthService } from '../auth.service';
import { CreateSessionResponse } from '../auth.types';
import { SessionService } from '../session.service';
import { SSOProvisioningPermissionsDto, SSOProvisioningUserDto } from './dto/sso-provisioning.dto';
import { SSOLinkTokenService } from './link-token.service';
import { SSOService } from './sso.service';

export abstract class SSOControllerRouteContext {
  protected abstract readonly ssoService: SSOService;
  protected abstract readonly linkTokenService: SSOLinkTokenService;
  protected abstract readonly usersService: UsersService;
  protected abstract readonly authService: AuthService;
  protected abstract assertPermissionMappingCeiling(
    mappings: Array<Record<string, string[]> | undefined>,
    actorPermissions: Set<string>,
  ): Promise<void>;
  protected abstract recordProviderAudit(
    action: 'created' | 'updated' | 'deleted',
    request: AuthenticatedRequest,
    provider: SSOProvider,
    before?: SSOProvider,
    rotated?: string[],
  ): Promise<void>;
  protected abstract providerRotationFlags(before: SSOProvider, after: SSOProvider): string[];
  protected abstract parseProviderId(rawProviderId: string): number;
  protected abstract loadProvisioningProvider(type: SSOProviderType, providerId: number): Promise<SSOProvider>;
  protected abstract assertProvisioningAuthorized(provider: SSOProvider, request: Request): void;
  protected abstract resolveProvisioningUser(
    providerType: SSOProviderType,
    providerId: number,
    payload: SSOProvisioningUserDto,
  ): Promise<import('@attraccess/database-entities').User>;
  protected abstract readonly sessionService: SessionService;
  protected abstract recordProvisioningAudit(
    action: 'sessions_revoked' | 'user_created' | 'user_deleted' | 'permissions_synced',
    provider: SSOProvider,
    userId: number,
    changes:
      | { sessionsRevoked: true }
      | { userCreated: true }
      | { userDeleted: true }
      | { added: string[]; removed: string[]; updated: string[] },
  ): Promise<void>;
  protected abstract applyProvisioningPermissions(
    userId: number,
    provider: SSOProvider,
    payload: SSOProvisioningPermissionsDto,
  ): Promise<{ added: string[]; removed: string[]; updated: string[] } | undefined>;
  protected abstract readonly metricsService: MetricsService;
  protected abstract finalizeLogin(
    request: AuthenticatedRequest,
    response: Response,
    redirectTo?: string,
    providerId?: number,
  ): Promise<CreateSessionResponse | void>;
  protected abstract readonly settingsService: SettingsService;
  protected abstract readonly cookieConfigService: CookieConfigService;
  protected abstract readonly identityAudit?: IdentityAuditService;
  protected abstract readonly logger: Logger;
  protected abstract extractProvisioningToken(request: Request): string | null;
  protected abstract readonly rbacService: RbacService;
  protected abstract providerSnapshot(provider: SSOProvider): string;
  protected abstract providerChanges(before: SSOProvider, after: SSOProvider, rotated: string[]): string;
  protected abstract recordSso(event: Parameters<SsoAuditService['record']>[0]): Promise<void>;
  protected abstract readonly ssoAudit?: SsoAuditService;
}
