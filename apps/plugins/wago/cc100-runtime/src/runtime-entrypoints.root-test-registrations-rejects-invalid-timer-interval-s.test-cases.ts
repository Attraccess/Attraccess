import { RootTestRegistrationsTestScope } from './runtime-entrypoints.spec';
export function registerRootTestRegistrationsRejectsInvalidTimerIntervalS(scope: RootTestRegistrationsTestScope): void {
  test.each(['0', '-1', '1.5', '2147483648'])('rejects invalid timer interval %s', async (value) => {
    process.env.WAGO_HEARTBEAT_INTERVAL_MS = value;
    await expect(import('./simulator')).rejects.toThrow('positive timer interval');
  });
}
