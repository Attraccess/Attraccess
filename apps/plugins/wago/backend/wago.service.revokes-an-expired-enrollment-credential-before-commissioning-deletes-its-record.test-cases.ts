import { WagoEnrollment } from './wago-enrollment.entity';
import type { WagoServiceTestScope } from "./wago.service.spec";
export function registerRevokesAnExpiredEnrollmentCredentialBeforeCommissioningDeletesItsRecord(scope: WagoServiceTestScope): void {
it('revokes an expired enrollment credential before commissioning deletes its record', async () => {
    const enrollment = {
      id: 3,
      mqttServerId: 2,
      hardwareId: 'cc100-01',
      identity: 'wago-enrollment-expired',
      expiresAt: '2020-01-01T00:00:00.000Z',
      revokedAt: null,
      consumedAt: null,
    } as WagoEnrollment;
    const { service, enrollmentRepository, context } = scope.createService([], [enrollment]);
    const revoke = jest.fn().mockResolvedValue(undefined);
    enrollmentRepository.findOneBy.mockResolvedValue(enrollment);
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({ revoke });

    await service.revokeEnrollmentById(enrollment.id);

    expect(revoke).toHaveBeenCalledWith({
      mqttServerId: enrollment.mqttServerId,
      identity: enrollment.identity,
      username: enrollment.identity,
      vhost: '/',
    });
    expect(enrollment).toMatchObject({ revokedAt: expect.any(String), consumedAt: expect.any(String) });
  });
}
