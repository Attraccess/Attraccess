import type { Setting } from '@attraccess/application-models';

/** Stored strings only. Encryption, cache and setup policy belong to the application. */
export abstract class SettingsPersistence {
  abstract read(parent: string, key: string): Promise<Setting | null>;
  abstract write(parent: string, key: string, value: string): Promise<void>;
  abstract remove(parent: string, key: string): Promise<void>;
  abstract countUsers(verifiedOnly?: boolean): Promise<number>;
}
