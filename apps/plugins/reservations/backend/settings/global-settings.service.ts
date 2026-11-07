import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { PLUGIN_CONTEXT } from '../constants';
import { GlobalSettingsEntity } from '../entities/global-settings.entity';
import { ReservationError } from '../reservations/errors';
import { isValidTimeZone, serverTimeZone } from '../time/zone';

const TIMEZONE_KEY = 'timezone';

/** Plugin-wide settings. The timezone drives bookable hours, the step grid, texts and iCal. */
@Injectable()
export class GlobalSettingsService {
  private cachedTimezone: string | null = null;

  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  /** The configured IANA timezone, or the server's when unset or no longer valid. Cached. */
  async getTimezone(): Promise<string> {
    if (this.cachedTimezone) return this.cachedTimezone;
    const row = await this.context.getRepository(GlobalSettingsEntity).findOneBy({ key: TIMEZONE_KEY });
    this.cachedTimezone = row && isValidTimeZone(row.value) ? row.value : serverTimeZone();
    return this.cachedTimezone;
  }

  async getGlobal(): Promise<{ timezone: string; defaultTimezone: string }> {
    return { timezone: await this.getTimezone(), defaultTimezone: serverTimeZone() };
  }

  async setTimezone(timezone: string): Promise<{ timezone: string; before: string }> {
    if (!isValidTimeZone(timezone)) {
      throw new ReservationError('INVALID_TIMEZONE', `"${String(timezone)}" is not a valid IANA timezone`);
    }
    const before = await this.getTimezone();
    const entity = new GlobalSettingsEntity();
    entity.key = TIMEZONE_KEY;
    entity.value = timezone;
    await this.context.runSerialized((manager) => manager.getRepository(GlobalSettingsEntity).save(entity));
    this.cachedTimezone = timezone;
    return { timezone, before };
  }
}
