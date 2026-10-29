import { loadedMatterJsVersion } from './version';

export type MatterPlatform = {
  version: string;
  /** Releases matter.js resources. Nothing is opened yet, so this is cheap and idempotent. */
  close(): Promise<void>;
};

/**
 * Loads matter.js and reports the version it resolved. Loading alone opens no Matter ports (UDP 5540, mDNS) and
 * writes no Matter storage; a later ticket creates the controller, and with it the fabric.
 */
export async function loadMatterPlatform(): Promise<MatterPlatform> {
  require('@matter/main');
  return { version: loadedMatterJsVersion(), close: async () => undefined };
}
