import { isDeepStrictEqual } from 'node:util';

import { SSOProvider } from '@attraccess/database-entities';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import { ForbiddenException, Injectable } from '@nestjs/common';

import { RbacService } from '../../../rbac/rbac.service';

import { SsoChangeAuditService } from '../audit/sso-change-audit.service';

import { CreateSSOProviderDto } from '../dto/create-sso-provider.dto';

import { UpdateSSOProviderDto } from '../dto/update-sso-provider.dto';

import { SSOProviderNotFoundException } from '../errors';

import { SSOService } from '../sso.service';

/** Null, undefined and an empty list all mean "defaults"; returns the list only when custom paths are set. */
function customRolePaths(value: string[] | null | undefined): string[] | null {
  return value && value.length > 0 ? value : null;
}

/** An omitted field means "unchanged"; otherwise compare entry by entry against the stored value. */
function sameRolePaths(incoming: string[] | null | undefined, stored: string[] | null | undefined): boolean {
  return incoming === undefined || isDeepStrictEqual(customRolePaths(incoming), customRolePaths(stored));
}

/**
 * Creating, changing and deleting SSO providers. Role settings need users.roles.manage, and a mapped role may
 * grant no permission the actor lacks. Every change is audited.
 */
@Injectable()
export class SsoProviderAdministrationService {
  constructor(
    private readonly ssoService: SSOService,
    private readonly rbacService: RbacService,
    private readonly changeAudit: SsoChangeAuditService,
  ) {}

  async getAll(): Promise<SSOProvider[]> {
    return this.ssoService.getAllProviders();
  }

  async getOneWithConfiguration(providerId: number): Promise<SSOProvider> {
    const provider = await this.ssoService.getProviderById(providerId);
    const withConfig = await this.ssoService.getProviderByTypeAndIdWithConfiguration(provider.type, providerId);
    if (!withConfig) throw new SSOProviderNotFoundException();
    return withConfig;
  }

  async create(createDto: CreateSSOProviderDto, actor: AuthenticatedUser): Promise<SSOProvider> {
    const oidcMappings = createDto.oidcConfiguration?.roleMappings;
    const samlMappings = createDto.samlConfiguration?.roleMappings;
    if (oidcMappings !== undefined || samlMappings !== undefined) {
      this.assertCanManageSsoRoles(actor, 'SSO role mappings');
      await this.assertPermissionMappingCeiling([oidcMappings, samlMappings], actor.effectivePermissions);
    }
    if (customRolePaths(createDto.oidcConfiguration?.roleClaimPaths)) {
      this.assertCanManageSsoRoles(actor, 'SSO role claim paths');
    }
    if (customRolePaths(createDto.samlConfiguration?.roleAttributeKeys)) {
      this.assertCanManageSsoRoles(actor, 'SSO role attribute keys');
    }
    const provider = await this.ssoService.createProvider(createDto);
    await this.changeAudit.recordProvider('created', actor, provider);
    return provider;
  }

  async update(providerId: number, updateDto: UpdateSSOProviderDto, actor: AuthenticatedUser): Promise<SSOProvider> {
    const before = await this.ssoService.getProviderById(providerId);

    const oidcMappings = updateDto.oidcConfiguration?.roleMappings;
    const samlMappings = updateDto.samlConfiguration?.roleMappings;

    if (oidcMappings !== undefined || samlMappings !== undefined) {
      this.assertCanManageSsoRoles(actor, 'SSO role mappings');
      await this.assertPermissionMappingCeiling([oidcMappings, samlMappings], actor.effectivePermissions);
    }

    if (!sameRolePaths(updateDto.oidcConfiguration?.roleClaimPaths, before.oidcConfiguration?.roleClaimPaths)) {
      this.assertCanManageSsoRoles(actor, 'SSO role claim paths');
    }
    if (!sameRolePaths(updateDto.samlConfiguration?.roleAttributeKeys, before.samlConfiguration?.roleAttributeKeys)) {
      this.assertCanManageSsoRoles(actor, 'SSO role attribute keys');
    }

    const provider = await this.ssoService.updateProvider(providerId, updateDto);
    await this.changeAudit.recordProvider(
      'updated',
      actor,
      provider,
      before,
      this.changeAudit.rotationFlags(before, provider),
    );
    return provider;
  }

  async delete(providerId: number, actor: AuthenticatedUser): Promise<void> {
    const provider = await this.ssoService.getProviderById(providerId);
    await this.ssoService.deleteProvider(providerId);
    await this.changeAudit.recordProvider('deleted', actor, provider);
  }

  private assertCanManageSsoRoles(actor: AuthenticatedUser, setting: string): void {
    if (!actor.effectivePermissions?.has('users.roles.manage')) {
      throw new ForbiddenException(`Configuring ${setting} requires users.roles.manage`);
    }
  }

  // Per-role ceiling: each mapped role must have permissions that are a subset of the actor's own
  private async assertPermissionMappingCeiling(
    mappings: Array<Record<string, string[]> | undefined>,
    actorPermissions: Set<string>,
  ): Promise<void> {
    const roleKeys = new Set(mappings.flatMap((m) => Object.keys(m ?? {})));
    if (roleKeys.size === 0) return;

    const allRoles = await this.rbacService.getRoles();
    const roleByKey = new Map(allRoles.map((r) => [r.key, r]));

    for (const roleKey of roleKeys) {
      const role = roleByKey.get(roleKey);
      if (!role) {
        throw new ForbiddenException(`Cannot map unknown role '${roleKey}'`);
      }
      const missing = role.rolePermissions.map((rp) => rp.permissionKey).filter((k) => !actorPermissions.has(k));
      if (missing.length > 0) {
        throw new ForbiddenException(
          `Cannot map role '${roleKey}': it grants permissions you do not hold (${missing.join(', ')})`,
        );
      }
    }
  }
}
