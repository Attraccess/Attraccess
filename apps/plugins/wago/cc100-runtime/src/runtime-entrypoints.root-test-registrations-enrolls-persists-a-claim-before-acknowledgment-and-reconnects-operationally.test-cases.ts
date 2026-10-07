import { RootTestRegistrationsTestScope } from './runtime-entrypoints.spec';
export function registerRootTestRegistrationsEnrollsPersistsAClaimBeforeAcknowledgmentAndReconnectsOperationally(
  scope: RootTestRegistrationsTestScope,
): void {
  test('enrolls, persists a claim before acknowledgment, and reconnects operationally', async () => {
    await scope.boot();
    const enrollment = scope.mockClients[0];
    enrollment.emit('connect');
    await scope.flush();
    expect(enrollment.publish).toHaveBeenCalledWith(
      'attraccess/wago/discovery/test-device',
      expect.stringContaining('123456'),
      expect.anything(),
      expect.any(Function),
    );
    enrollment.emit(
      'message',
      'attraccess/wago/discovery/test-device/claim',
      Buffer.from(
        JSON.stringify({
          username: 'permanent',
          password: 'new-password',
          configuration: { namespace: '/local/wago/' },
          acknowledgementToken: 'ack-token',
        }),
      ),
    );
    await scope.flush();
    expect(scope.mockState).toEqual(
      expect.objectContaining({
        credentials: { username: 'permanent', password: 'new-password' },
        operationalPrefix: 'local/wago',
      }),
    );
    expect(enrollment.publish).toHaveBeenCalledWith(
      'attraccess/wago/discovery/test-device/claim/ack',
      JSON.stringify({ acknowledgementToken: 'ack-token' }),
      expect.anything(),
      expect.any(Function),
    );
    expect(scope.mockStore.save.mock.invocationCallOrder.at(-1)).toBeLessThan(
      enrollment.end.mock.invocationCallOrder[0],
    );
    const operational = scope.mockClients[1];
    operational.emit('connect');
    await scope.flush();
    expect(scope.mockRuntime.start).toHaveBeenCalledTimes(1);
    operational.emit('close');
    await scope.flush();
    expect(scope.mockRuntime.setConnected).toHaveBeenLastCalledWith(false);
    operational.emit('connect');
    await scope.flush();
    expect(scope.mockRuntime.start).toHaveBeenCalledTimes(1);
    expect(scope.mockRuntime.publishHeartbeat).toHaveBeenCalled();
  });
}
