import type { OsAdapter } from './platform-adapter';

export class NullAdapter implements OsAdapter {
  async tryOsLock(): Promise<boolean> { return false; }
  async installStartupEntry(): Promise<void> { /* no-op on unsupported platforms */ }
  permissionsStatus() { return { needed: false, accessibility: true } as const; }
  requestPermissions(): void { /* no-op on unsupported platforms */ }
  lockShortcuts(): readonly string[] { return []; }
}
