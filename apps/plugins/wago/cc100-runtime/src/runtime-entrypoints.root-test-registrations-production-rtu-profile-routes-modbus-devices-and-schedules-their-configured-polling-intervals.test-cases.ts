import { RootTestRegistrationsTestScope } from './runtime-entrypoints.spec';
export function registerRootTestRegistrationsProductionRtuProfileRoutesModbusDevicesAndSchedulesTheirConfiguredPollingIntervals(
  scope: RootTestRegistrationsTestScope,
): void {
  test('production RTU profile routes Modbus devices and schedules their configured polling intervals', async () => {
    process.env.WAGO_HARDWARE_PROFILE = 'cc100-751-9301-fw31-digital-rtu-v1';
    delete process.env.WAGO_IO_PATHS;
    scope.mockState = { credentials: { username: 'permanent', password: 'persisted' } };
    await import('./main');
    await scope.flush();
    const { WagoRuntime } = await import('./runtime');
    const { ModbusDeviceRouter } = await import('./modbus/adapter');
    expect(jest.mocked(WagoRuntime).mock.calls[0][0].device).toBeInstanceOf(ModbusDeviceRouter);
    scope.mockClients[0].emit('connect');
    await scope.flush();
    await jest.advanceTimersByTimeAsync(100);
    expect(scope.mockRuntime.publishMeasurements).toHaveBeenCalledTimes(1);
  });
}
