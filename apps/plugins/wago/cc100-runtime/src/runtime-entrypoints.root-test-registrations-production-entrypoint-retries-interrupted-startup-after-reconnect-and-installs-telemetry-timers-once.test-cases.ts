import { RootTestRegistrationsTestScope } from './runtime-entrypoints.spec';
export function registerRootTestRegistrationsProductionEntrypointRetriesInterruptedStartupAfterReconnectAndInstallsTelemetryTimersOnce(
  scope: RootTestRegistrationsTestScope,
): void {
  test('production entrypoint retries interrupted startup after reconnect and installs telemetry timers once', async () => {
    process.env.WAGO_HARDWARE_PROFILE = 'cc100-751-9301-fw31-digital-rtu-v1';
    delete process.env.WAGO_IO_PATHS;
    scope.mockState = { credentials: { username: 'permanent', password: 'persisted' } };
    let failStartup!: (error: Error) => void;
    scope.mockRuntime.start.mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => (failStartup = reject)),
    );
    await import('./main');
    await scope.flush();
    const client = scope.mockClients[0];
    client.emit('connect');
    await scope.flush();
    client.connected = false;
    client.emit('close');
    await scope.flush();
    client.connected = true;
    client.emit('connect');
    await scope.flush();
    // Reconnect can arrive before slow disconnect handling has unwound startup.
    failStartup(new Error('MQTT subscribe acknowledgment timed out'));
    await scope.flush();
    expect(scope.mockRuntime.start).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(100);
    expect(scope.mockRuntime.publishMeasurements).toHaveBeenCalledTimes(1);
    client.emit('connect');
    await scope.flush();
    await jest.advanceTimersByTimeAsync(100);
    expect(scope.mockRuntime.start).toHaveBeenCalledTimes(2);
    expect(scope.mockRuntime.publishMeasurements).toHaveBeenCalledTimes(2);
  });
}
