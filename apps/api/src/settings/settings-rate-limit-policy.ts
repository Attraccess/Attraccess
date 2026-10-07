import {
  AUTH_KEYS,
  AUTH_PARENT,
  MESSAGING_KEYS,
  MESSAGING_PARENT,
  MESSAGING_RATE_LIMIT_DEFAULTS,
  MessagingRateLimitPolicy,
  RATE_LIMIT_DEFAULTS,
  RateLimitPolicy,
} from './constants';
import { AuthRateLimitSettingsDto } from './dto/auth-rate-limit-settings.dto';
import { MessagingRateLimitSettingsDto } from './dto/messaging-rate-limit-settings.dto';
import { UpdateAuthRateLimitSettingsDto } from './dto/update-auth-rate-limit-settings.dto';
import { UpdateMessagingRateLimitSettingsDto } from './dto/update-messaging-rate-limit-settings.dto';
import { parsePositiveFloat, parsePositiveInt } from './settings.service.route-context';
import { SettingsServiceRouteContext } from './settings.service.route-context';
export abstract class SettingsRateLimitPolicyImplementation extends SettingsServiceRouteContext {
  async getAuthRateLimitSettings(): Promise<AuthRateLimitSettingsDto> {
    return this.resolveRateLimitPolicy();
  }

  async getRateLimitPolicy(): Promise<RateLimitPolicy> {
    return this.resolveRateLimitPolicy();
  }

  async updateAuthRateLimitSettings(update: UpdateAuthRateLimitSettingsDto): Promise<AuthRateLimitSettingsDto> {
    const writes: Array<Promise<void>> = [];
    if (update.maxAttempts !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(AUTH_PARENT, AUTH_KEYS.rateLimitMaxAttempts, String(update.maxAttempts)),
      );
    }
    if (update.windowSeconds !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(AUTH_PARENT, AUTH_KEYS.rateLimitWindowSeconds, String(update.windowSeconds)),
      );
    }
    if (update.lockoutDurationSeconds !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(
          AUTH_PARENT,
          AUTH_KEYS.rateLimitLockoutDurationSeconds,
          String(update.lockoutDurationSeconds),
        ),
      );
    }
    if (update.exponentialBackoff !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(
          AUTH_PARENT,
          AUTH_KEYS.rateLimitExponentialBackoff,
          update.exponentialBackoff ? 'true' : 'false',
        ),
      );
    }
    if (update.backoffMultiplier !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(
          AUTH_PARENT,
          AUTH_KEYS.rateLimitBackoffMultiplier,
          String(update.backoffMultiplier),
        ),
      );
    }
    await Promise.all(writes);
    return this.resolveRateLimitPolicy();
  }

  protected async resolveRateLimitPolicy(): Promise<RateLimitPolicy> {
    const [maxAttempts, windowSeconds, lockoutDurationSeconds, exponentialBackoff, backoffMultiplier] =
      await Promise.all([
        this.settingsStore.getPlainSetting(AUTH_PARENT, AUTH_KEYS.rateLimitMaxAttempts),
        this.settingsStore.getPlainSetting(AUTH_PARENT, AUTH_KEYS.rateLimitWindowSeconds),
        this.settingsStore.getPlainSetting(AUTH_PARENT, AUTH_KEYS.rateLimitLockoutDurationSeconds),
        this.settingsStore.getPlainSetting(AUTH_PARENT, AUTH_KEYS.rateLimitExponentialBackoff),
        this.settingsStore.getPlainSetting(AUTH_PARENT, AUTH_KEYS.rateLimitBackoffMultiplier),
      ]);

    return {
      maxAttempts: parsePositiveInt(maxAttempts, RATE_LIMIT_DEFAULTS.maxAttempts),
      windowSeconds: parsePositiveInt(windowSeconds, RATE_LIMIT_DEFAULTS.windowSeconds),
      lockoutDurationSeconds: parsePositiveInt(lockoutDurationSeconds, RATE_LIMIT_DEFAULTS.lockoutDurationSeconds),
      exponentialBackoff: exponentialBackoff === 'true',
      backoffMultiplier: parsePositiveFloat(backoffMultiplier, RATE_LIMIT_DEFAULTS.backoffMultiplier),
    };
  }

  async getMessagingRateLimitSettings(): Promise<MessagingRateLimitSettingsDto> {
    return this.resolveMessagingRateLimitPolicy();
  }

  async getMessagingRateLimitPolicy(): Promise<MessagingRateLimitPolicy> {
    return this.resolveMessagingRateLimitPolicy();
  }

  async updateMessagingRateLimitSettings(
    update: UpdateMessagingRateLimitSettingsDto,
  ): Promise<MessagingRateLimitSettingsDto> {
    const writes: Array<Promise<void>> = [];
    if (update.sendMaxPerWindow !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(
          MESSAGING_PARENT,
          MESSAGING_KEYS.sendRateLimitMax,
          String(update.sendMaxPerWindow),
        ),
      );
    }
    if (update.sendWindowSeconds !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(
          MESSAGING_PARENT,
          MESSAGING_KEYS.sendRateLimitWindowSeconds,
          String(update.sendWindowSeconds),
        ),
      );
    }
    if (update.contactMaxPerWindow !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(
          MESSAGING_PARENT,
          MESSAGING_KEYS.contactRateLimitMax,
          String(update.contactMaxPerWindow),
        ),
      );
    }
    if (update.contactWindowSeconds !== undefined) {
      writes.push(
        this.settingsStore.setPlainSetting(
          MESSAGING_PARENT,
          MESSAGING_KEYS.contactRateLimitWindowSeconds,
          String(update.contactWindowSeconds),
        ),
      );
    }
    await Promise.all(writes);
    return this.resolveMessagingRateLimitPolicy();
  }

  protected async resolveMessagingRateLimitPolicy(): Promise<MessagingRateLimitPolicy> {
    const [sendMax, sendWindow, contactMax, contactWindow] = await Promise.all([
      this.settingsStore.getPlainSetting(MESSAGING_PARENT, MESSAGING_KEYS.sendRateLimitMax),
      this.settingsStore.getPlainSetting(MESSAGING_PARENT, MESSAGING_KEYS.sendRateLimitWindowSeconds),
      this.settingsStore.getPlainSetting(MESSAGING_PARENT, MESSAGING_KEYS.contactRateLimitMax),
      this.settingsStore.getPlainSetting(MESSAGING_PARENT, MESSAGING_KEYS.contactRateLimitWindowSeconds),
    ]);

    return {
      sendMaxPerWindow: parsePositiveInt(sendMax, MESSAGING_RATE_LIMIT_DEFAULTS.sendMaxPerWindow),
      sendWindowSeconds: parsePositiveInt(sendWindow, MESSAGING_RATE_LIMIT_DEFAULTS.sendWindowSeconds),
      contactMaxPerWindow: parsePositiveInt(contactMax, MESSAGING_RATE_LIMIT_DEFAULTS.contactMaxPerWindow),
      contactWindowSeconds: parsePositiveInt(contactWindow, MESSAGING_RATE_LIMIT_DEFAULTS.contactWindowSeconds),
    };
  }
}
