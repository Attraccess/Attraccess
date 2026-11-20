import { type PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { PLUGIN_CONTEXT } from '../constants';

export type Lang = 'en' | 'de';

/** Permissions that make a user a manager of every resource (mirrors AccessService.isManager). */
const MANAGER_PERMISSIONS = ['resources.update'];

export function normalizeLanguage(locale: string | null | undefined, fallback: Lang): Lang {
  const tag = (locale ?? '').toLowerCase();
  if (tag === 'de' || tag.startsWith('de-') || tag.startsWith('de_')) return 'de';
  if (tag === 'en' || tag.startsWith('en-') || tag.startsWith('en_')) return 'en';
  return fallback;
}

/**
 * Read-only lookups into host tables that the notification texts need: the public base URL for email
 * links, recipient languages and the managers of a resource. All of it goes through `hostData`
 * (READ_SETTINGS / READ_USERS / ACCESS_RESOURCES); nothing is written.
 */
@Injectable()
export class HostInfoService {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  private async setting(key: string): Promise<string | null> {
    return this.context.hostData.settings.getApp(key);
  }

  /**
   * The application's public URL, the same setting core uses for links in emails (`app/backend_url`),
   * without trailing slash. Null when the admin never configured it (emails then carry no links).
   */
  async getBaseUrl(): Promise<string | null> {
    const url = await this.setting('backend_url');
    return url ? url.replace(/\/+$/, '') : null;
  }

  /** The installation's default language. Core treats "never configured" as German. */
  async getDefaultLanguage(): Promise<Lang> {
    const stored = (await this.setting('default_language')) ?? (await this.setting('attractap_language'));
    return stored === null ? 'de' : normalizeLanguage(stored, 'en');
  }

  /** Language per user (supported locale wins, else the installation default). */
  async languagesOf(userIds: number[]): Promise<Map<number, Lang>> {
    const ids = [...new Set(userIds)];
    const result = new Map<number, Lang>();
    if (ids.length === 0) return result;
    const [fallback, locales] = await Promise.all([
      this.getDefaultLanguage(),
      this.context.hostData.users.getLocales(ids),
    ]);
    for (const [id, locale] of locales) result.set(id, normalizeLanguage(locale, fallback));
    for (const id of ids) if (!result.has(id)) result.set(id, fallback);
    return result;
  }

  /** Health entries of the resource that are currently unhealthy (a resource may carry several). */
  countUnhealthyEntries(resourceId: number): Promise<number> {
    return this.context.hostData.resources.countUnhealthyEntries(resourceId);
  }

  /**
   * Users managing the resource: everyone holding `resources.update` (role join, one query; the global
   * `resources.maintenance.manage` permission makes nobody a reservation manager) plus introducers and maintainers of the resource or of one of its groups
   * (one query). This is exactly the set for which AccessService.isManager is true, resolved in two
   * queries instead of one permission check per user. Soft-deleted users are skipped like core's
   * RbacService.getUserIdsWithPermission does (they keep their role and introducer rows).
   */
  async managerIdsOf(resourceId: number): Promise<number[]> {
    const [introducers, permitted] = await Promise.all([
      this.context.hostData.resources.listIntroducerUserIds(resourceId),
      this.context.hostData.users.listIdsWithAnyPermission(MANAGER_PERMISSIONS),
    ]);
    return [...new Set([...introducers, ...permitted])];
  }
}
