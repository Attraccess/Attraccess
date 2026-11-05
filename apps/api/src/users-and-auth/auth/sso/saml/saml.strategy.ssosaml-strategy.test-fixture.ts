import { SSOProviderSAMLConfiguration } from '@attraccess/database-entities';
import { ModuleRef } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { SsoAuditService } from '../../../../audit/sso-audit.service';
import { MetricsService } from '../../../../metrics/metrics.service';
import { RbacService } from '../../../rbac/rbac.service';
import { UsersService } from '../../../users/users.service';
import { AuthService } from '../../auth.service';
import { SsoAccountResolver } from '../account-resolution/sso-account-resolver.service';
import { SSOService } from '../sso.service';
import { SSOSamlRequest } from './saml.types';

export type SamlProfile = Record<string, unknown>;
/** ModuleRef whose SsoAccountResolver is the real one, running on the given users/auth mocks. */
export function buildSamlModuleRef(deps: {
  users: object;
  auth?: object;
  rbac?: unknown;
  sso?: unknown;
  audit?: unknown;
  metrics?: unknown;
}): ModuleRef {
  const auth = deps.auth ?? { findUserIdBySSO: jest.fn().mockResolvedValue(null), addAuthenticationDetails: jest.fn() };
  const dataSource = { transaction: (work: (manager: unknown) => unknown) => work({}) };
  const resolver = new SsoAccountResolver(
    { recordCreatedUser: jest.fn(), ...deps.users } as unknown as UsersService,
    auth as AuthService,
    dataSource as unknown as DataSource,
  );
  const byToken = new Map<unknown, unknown>([
    [SsoAccountResolver, resolver],
    [UsersService, deps.users],
    [AuthService, auth],
    [RbacService, deps.rbac ?? null],
    [SSOService, deps.sso],
    [SsoAuditService, deps.audit],
    [MetricsService, deps.metrics],
  ]);
  return { get: jest.fn((token: unknown) => byToken.get(token)) } as unknown as ModuleRef;
}

export function registerSsosamlStrategyFixture() {
  const buildRequest = (providerId: number, emailKey: string): SSOSamlRequest => {
    const samlConfiguration = {
      entryPoint: 'https://idp.example.com/sso',
      issuer: 'https://sp.example.com',
      certificate: 'CERTIFICATE',
      signRequest: false,
      wantAssertionsSigned: false,
      wantAuthnResponseSigned: true,
      forceAuthn: false,
      emailAttributeKeys: [emailKey],
      ssoProviderId: providerId,
    } as SSOProviderSAMLConfiguration;

    return {
      ssoSamlOptions: {
        providerId,
        samlConfiguration,
        callbackUrl: `https://api.example.com/auth/sso/SAML/${providerId}/callback`,
      },
    } as SSOSamlRequest;
  };
  return {
    get buildRequest() {
      return buildRequest;
    },
  };
}
