import { RootTestRegistrationsTestScope } from './runtime-entrypoints.spec';
export function registerRootTestRegistrationsAnswersIpcDeviceReadsAndIgnoresMalformedMessages(
  scope: RootTestRegistrationsTestScope,
): void {
  test('answers IPC device reads and ignores malformed messages', async () => {
    const originalSend = process.send;
    const send = jest.fn();
    process.send = send;
    try {
      scope.mockState = {
        credentials: { username: 'u', password: 'p' },
        accepted: {
          snapshot: {
            logicalChannels: [{ id: 'load', physicalPointId: 'point' }],
            physicalPoints: [{ id: 'point' }],
          },
        },
      };
      await scope.boot();
      const receive = scope.handlers.get('message');
      receive?.(null);
      receive?.({ type: 'unrelated', id: 'ignore', channelId: 'load' });
      receive?.({ type: 'simulator-read', id: 'missing', channelId: 'absent' });
      receive?.({ type: 'simulator-read', id: 'valid', channelId: 'load' });
      await scope.flush();
      expect(send.mock.calls).toEqual([
        [{ type: 'simulator-read-result', id: 'missing', error: 'unknown channel' }],
        [{ type: 'simulator-read-result', id: 'valid', value: true }],
      ]);
    } finally {
      process.send = originalSend;
    }
  });
}
