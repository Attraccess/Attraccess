import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import {
  WagoCommissioningService
} from './wago-commissioning.service';
import { WagoService } from './wago.service';
import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerAutomaticallyClaimsEachConcurrentSessionOnlyForItsBoundDiscovery(scope: WagoCommissioningServiceTestScope): void {
it('automatically claims each concurrent session only for its bound discovery', async () => {
    const first = {
      id: 1,
      hardwareId: 'cc100-01',
      mqttServerId: 2,
      enrollmentId: 3,
      controllerName: 'Boiler room',
      pairingCode: 'encrypted:v1:first',
      state: 'awaiting_discovery',
      failureReason: null,
      auditLog: '[]',
      updatedAt: '',
    } as WagoCommissioningSession;
    const second = {
      ...first,
      id: 2,
      hardwareId: 'cc100-02',
      enrollmentId: 4,
      controllerName: 'Pump room',
      pairingCode: 'encrypted:v1:second',
    };
    const sessions = [first, second];
    const repository = {
      find: jest.fn().mockResolvedValue([]),
      findOneBy: jest.fn().mockImplementation(async (where) => {
        if ('id' in where) return sessions.find((session) => session.id === where.id) ?? null;
        return (
          sessions.find(
            (session) =>
              session.hardwareId === where.hardwareId &&
              session.mqttServerId === where.mqttServerId &&
              session.enrollmentId === where.enrollmentId,
          ) ?? null
        );
      }),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const registerCommissioningDiscoveryHandler = jest.fn();
    const wago = {
      registerCommissioningDiscoveryHandler,
      claim: jest.fn().mockResolvedValue(undefined),
    } as unknown as WagoService;
    const context = { getRepository: jest.fn().mockReturnValue(repository), secrets: scope.secrets } as unknown as PluginContext;
    const service = new WagoCommissioningService(context, wago);
    await service.onApplicationBootstrap();

    const handler = registerCommissioningDiscoveryHandler.mock.calls[0][0] as (controller: {
      id: number;
      hardwareId: string;
      mqttServerId: number;
      enrollmentId: number;
    }) => Promise<void>;
    await Promise.all([
      handler({
        id: 9,
        hardwareId: first.hardwareId,
        mqttServerId: first.mqttServerId,
        enrollmentId: first.enrollmentId,
      }),
      handler({
        id: 10,
        hardwareId: second.hardwareId,
        mqttServerId: second.mqttServerId,
        enrollmentId: second.enrollmentId,
      }),
    ]);

    expect(wago.claim).toHaveBeenCalledWith(9, 'Boiler room', scope.verifier, 2, expect.any(Function));
    expect(wago.claim).toHaveBeenCalledWith(10, 'Pump room', scope.verifier, 2, expect.any(Function));
    expect(first.state).toBe('awaiting_verification');
    expect(second.state).toBe('awaiting_verification');
    expect(first.pairingCode).toBeNull();
    expect(second.pairingCode).toBeNull();
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ auditLog: expect.stringContaining('automatic_claim_completed') }),
    );

    await handler({ id: 11, hardwareId: first.hardwareId, mqttServerId: 4, enrollmentId: 5 });
    expect(wago.claim).toHaveBeenCalledTimes(2);
  });
}
