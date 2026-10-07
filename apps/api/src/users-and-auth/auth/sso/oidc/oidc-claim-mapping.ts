import { get } from 'lodash-es';
import { OIDCAppState } from './oidc-cookie-state-store';
import { SSOOIDCStrategyRouteContext } from './oidc.strategy.route-context';
export abstract class OidcClaimMappingImplementation extends SSOOIDCStrategyRouteContext {
  protected isOIDCAppState(value: unknown): value is OIDCAppState {
    return (
      value !== null &&
      typeof value === 'object' &&
      (!('redirectTo' in value) || typeof (value as OIDCAppState).redirectTo === 'string')
    );
  }

  protected firstNonEmptyStringFromPaths(paths: string[], sources: unknown[]): string | undefined {
    for (const p of paths) {
      for (const src of sources) {
        const value = get(src, p);
        if (typeof value === 'string' && value.trim().length > 0) {
          return value;
        }
      }
    }
    return undefined;
  }

  protected parseIdTokenClaims(idToken?: string): Record<string, unknown> | undefined {
    if (!idToken) {
      return undefined;
    }

    const parts = idToken.split('.');
    if (parts.length < 2) {
      this.logger.warn('OIDC id_token format invalid; skipping claim extraction');
      return undefined;
    }

    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const payload = Buffer.from(padded, 'base64').toString('utf8');
      return JSON.parse(payload) as Record<string, unknown>;
    } catch (error) {
      this.logger.warn(`Failed to parse id_token claims: ${String(error)}`);
      return undefined;
    }
  }

  protected getPermissionClaimValues(claimSources: unknown[]): unknown[] {
    const paths = ['permissions', 'roles', 'groups', 'realm_access.roles'];
    if (this.config.clientId) {
      paths.push(`resource_access.${this.config.clientId}.roles`);
    }

    const values: unknown[] = [];
    for (const path of paths) {
      for (const source of claimSources) {
        const value = get(source, path);
        if (value !== undefined && value !== null) {
          values.push(value);
        }
      }
    }

    return values;
  }

  protected resolveRoleNamesFromClaims(claimValues: unknown[]): string[] {
    const roleNames: string[] = [];

    for (const value of claimValues) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === 'string') roleNames.push(entry);
        }
        continue;
      }
      if (typeof value === 'string') {
        roleNames.push(value);
        continue;
      }
      if (value && typeof value === 'object') {
        for (const entry of Object.values(value)) {
          if (typeof entry === 'string') roleNames.push(entry);
          else if (Array.isArray(entry)) {
            for (const item of entry) {
              if (typeof item === 'string') roleNames.push(item);
            }
          }
        }
      }
    }

    this.logger.debug(`Resolved SSO role names: ${JSON.stringify(roleNames)}`);
    return roleNames;
  }
}
