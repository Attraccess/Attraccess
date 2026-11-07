import {
  ResourceHealthState,
  ResourceIntroducer,
  Setting,
  User,
  UserRole,
  type PluginContext,
} from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { PLUGIN_CONTEXT } from '../constants';

export type Lang = 'en' | 'de';

/** Permissions that make a user a manager of every resource (mirrors AccessService.isManager). */
const MANAGER_PERMISSIONS = ['resources.update', 'resources.maintenance.manage'];

export function normalizeLanguage(locale: string | null | undefined, fallback: Lang): Lang {
  const tag = (locale ?? '').toLowerCase();
  if (tag === 'de' || tag.startsWith('de-') || tag.startsWith('de_')) return 'de';
  if (tag === 'en' || tag.startsWith('en-') || tag.startsWith('en_')) return 'en';
  return fallback;
}

/**
 * Read-only lookups into host tables that the notification texts need: the public base URL for email
 * links, recipient languages and the managers of a resource. All of it goes through the plugin's
 * READ_SETTINGS / READ_USERS / DATABASE_ACCESS repositories; nothing is written.
 */
@Injectable()
export class HostInfoService {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  private async setting(key: string): Promise<string | null> {
    const row = await this.context.getRepository(Setting).findOneBy({ parent: 'app', key });
    const value = row?.value?.trim();
    return value ? value : null;
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
    const [fallback, rows] = await Promise.all([
      this.getDefaultLanguage(),
      this.context
        .getRepository(User)
        .createQueryBuilder('user')
        .select(['user.id', 'user.locale'])
        .where('user.id IN (:...ids)', { ids })
        .getMany(),
    ]);
    for (const row of rows) result.set(row.id, normalizeLanguage(row.locale, fallback));
    for (const id of ids) if (!result.has(id)) result.set(id, fallback);
    return result;
  }

  /** Health entries of the resource that are currently unhealthy (a resource may carry several). */
  countUnhealthyEntries(resourceId: number): Promise<number> {
    return this.context.getRepository(ResourceHealthState).countBy({ resourceId, status: 'unhealthy' as never });
  }

  /**
   * Users managing the resource: everyone holding `resources.update` / `resources.maintenance.manage`
   * (role join, one query) plus introducers and maintainers of the resource or of one of its groups
   * (one query). This is exactly the set for which AccessService.isManager is true, resolved in two
   * queries instead of one permission check per user.
   */
  async managerIdsOf(resourceId: number): Promise<number[]> {
    const [introducers, permitted] = await Promise.all([
      this.context
        .getRepository(ResourceIntroducer)
        .createQueryBuilder('introducer')
        .select('introducer.userId', 'userId')
        .leftJoin('introducer.resourceGroup', 'group')
        .leftJoin('group.resources', 'resource')
        .where('introducer.resourceId = :resourceId', { resourceId })
        .orWhere('resource.id = :resourceId', { resourceId })
        .getRawMany<{ userId: number }>(),
      this.context
        .getRepository(UserRole)
        .createQueryBuilder('ur')
        .select('ur.userId', 'userId')
        .distinct(true)
        .innerJoin('ur.role', 'role')
        .innerJoin('role.rolePermissions', 'rp')
        .where('rp.permissionKey IN (:...keys)', { keys: MANAGER_PERMISSIONS })
        .getRawMany<{ userId: number }>(),
    ]);
    return [...new Set([...introducers, ...permitted].map((row) => Number(row.userId)))];
  }
}
