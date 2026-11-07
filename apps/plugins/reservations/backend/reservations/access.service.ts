import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { PLUGIN_CONTEXT } from '../constants';
import type { ResourceSettings } from '../settings/settings.model';
import type { BookingConflictCode } from './errors';

export interface CanBookResult {
  allowed: boolean;
  /** Set when not allowed: the conflict code a booking attempt would fail with. */
  reason: BookingConflictCode | null;
}

/** Who may do what, on top of the host's authorization data (ACCESS_RESOURCES). */
@Injectable()
export class AccessService {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  /**
   * Manager of the resource: `resources.update` permission, or maintainer/introducer of the resource or
   * its group (`canMaintain`).
   */
  async isManager(userId: number, resourceId: number): Promise<boolean> {
    const access = this.context.resourceAccess;
    if (await access.hasPermission(userId, 'resources.update')) return true;
    return access.canMaintain(userId, resourceId);
  }

  /** Resources the user manages: `null` means all (resources.update), otherwise the maintained ids. */
  async managedResourceIds(userId: number): Promise<number[] | null> {
    const access = this.context.resourceAccess;
    if (await access.hasPermission(userId, 'resources.update')) return null;
    return access.listResourceIdsMaintained(userId);
  }

  /** Whether the user may book under the resource's `whoCanBook` rule (booking never grants start rights). */
  async canBook(userId: number, resourceId: number, settings: ResourceSettings): Promise<CanBookResult> {
    if (!settings.enabled) return { allowed: false, reason: 'RESERVATIONS_DISABLED' };
    if (settings.whoCanBook === 'any-user') return { allowed: true, reason: null };
    if (await this.isManager(userId, resourceId)) return { allowed: true, reason: null };
    if (settings.whoCanBook === 'can-start') {
      const start = await this.context.resourceAccess.canStart(userId, resourceId);
      if (start.allowed || (start.supervisionAllowed && start.requiresSupervision)) {
        return { allowed: true, reason: null };
      }
    }
    return { allowed: false, reason: 'NOT_ALLOWED_TO_BOOK' };
  }
}
