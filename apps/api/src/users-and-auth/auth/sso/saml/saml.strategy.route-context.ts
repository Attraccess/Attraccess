import { PassportSamlConfig, Strategy, MultiSamlStrategy, Profile as SamlProfile } from '@node-saml/passport-saml';
import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PassportStrategy } from '@nestjs/passport';

export type StrategyCtor = new (...args: unknown[]) => Strategy;

export type SamlOptionsCallback = (error: Error | null, samlOptions?: PassportSamlConfig) => void;

export abstract class SSOSamlStrategyRouteContext extends PassportStrategy(
  MultiSamlStrategy as unknown as StrategyCtor,
  'sso-saml',
) {
  protected abstract readonly logger: Logger;
  protected abstract getPermissionClaimValues(profile: SamlProfile): unknown[];
  protected abstract resolveRoleNamesFromClaims(claimValues: unknown[]): string[];
  protected abstract readonly moduleRef: ModuleRef;
  protected abstract recordProvisioningAudit(
    userId: number,
    providerId: number,
    action: 'user_created' | 'permissions_synced',
    changes?: { added: string[]; removed: string[]; updated: string[] },
  ): Promise<void>;
}
