import type { PluginAccessPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { PLUGIN_CONTEXT } from '../constants';
import type { ResourceSettings } from '../settings/settings.model';
import { type AccessSubject, accessPrincipal, subjectUserId } from './actor';
import { mapWithConcurrency } from './concurrency';
import type { BookingConflictCode } from './errors';

/** Core attribution lookups in flight at once (each loads the user and may run several access queries). */
const LOOKUP_CONCURRENCY = 8;

export interface CanBookResult {
  allowed: boolean;
  /** Set when not allowed: the conflict code a booking attempt would fail with. */
  reason: BookingConflictCode | null;
}

/**
 * Who may do what, on top of the host's authorization data (ACCESS_RESOURCES). Request paths pass their actor so
 * API-token scopes apply exactly as core applies them; background work passes a plain user id (full permissions).
 */
@Injectable()
export class AccessService {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  /**
   * Manager of the resource: `resources.update` permission, or maintainer/introducer of the resource or
   * its group. Only the roles count, not the global `resources.maintenance.manage` permission (`canMaintain`
   * alone would grant every resource for it); roles apply whatever an API token's scope.
   */
  async isManager(subject: AccessSubject, resourceId: number): Promise<boolean> {
    const access = this.context.resourceAccess;
    if (await access.hasPermission(accessPrincipal(subject), 'resources.update')) return true;
    return access.canMaintain(rolesOnly(subject), resourceId);
  }

  /** Holds `resources.update` (sees and manages every resource). */
  hasUpdatePermission(subject: AccessSubject): Promise<boolean> {
    return this.context.resourceAccess.hasPermission(accessPrincipal(subject), 'resources.update');
  }

  /**
   * Resources (of `resourceIds`) whose current user's name the subject may see, by core's rule
   * (`resourceAccess.canSeeUsageAttribution`). The plugin shows a booking holder's name to exactly these viewers,
   * on top of the holder themselves and the resource's managers.
   */
  async attributionResourceIds(subject: AccessSubject, resourceIds: number[]): Promise<Set<number>> {
    const access = this.context.resourceAccess;
    const principal = accessPrincipal(subject);
    const ids = [...new Set(resourceIds)];
    const allowed = await mapWithConcurrency(ids, LOOKUP_CONCURRENCY, (id) =>
      access.canSeeUsageAttribution(principal, id),
    );
    return new Set(ids.filter((_, index) => allowed[index]));
  }

  /** Resources the user manages: `null` means all (resources.update), otherwise the maintained ids (roles only). */
  async managedResourceIds(subject: AccessSubject): Promise<number[] | null> {
    const access = this.context.resourceAccess;
    if (await access.hasPermission(accessPrincipal(subject), 'resources.update')) return null;
    return access.listResourceIdsMaintained(rolesOnly(subject));
  }

  /**
   * Whether the user may book under the resource's `whoCanBook` rule (booking never grants start rights).
   * Pass `isManager` when the caller already resolved it to skip a second lookup.
   */
  async canBook(
    subject: AccessSubject,
    resourceId: number,
    settings: ResourceSettings,
    isManager?: boolean,
  ): Promise<CanBookResult> {
    if (!settings.enabled) return { allowed: false, reason: 'RESERVATIONS_DISABLED' };
    if (settings.whoCanBook === 'any-user') return { allowed: true, reason: null };
    if (isManager ?? (await this.isManager(subject, resourceId))) return { allowed: true, reason: null };
    if (settings.whoCanBook === 'can-start') {
      const start = await this.context.resourceAccess.canStart(accessPrincipal(subject), resourceId);
      if (start.allowed || (start.supervisionAllowed && start.requiresSupervision)) {
        return { allowed: true, reason: null };
      }
    }
    return { allowed: false, reason: 'NOT_ALLOWED_TO_BOOK' };
  }
}

/** An empty permission scope: core then answers maintainer/introducer roles only. */
function rolesOnly(subject: AccessSubject): PluginAccessPrincipal {
  return { id: subjectUserId(subject), effectivePermissions: [] };
}
