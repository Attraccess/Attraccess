import { createHash } from 'node:crypto';
import { WagoNetworkChangeService } from './wago-network-change.service';
import { WagoService } from './wago.service';
import { managedSsh } from './wago-managed-ssh';
import type { SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope } from "./wago-network-change.spec";
export function registerRefreshesCorrectedBrokerSettingsAfterFailedVerificationAndRetainsTheReplacementAcrossInt(scope: SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope): void {
it('refreshes corrected broker settings after failed verification and retains the replacement across interruption', async () => {
    scope.allowEvidence = false;
    const originalTimeout = setTimeout;
    const timeout = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((callback, milliseconds, ...args) =>
        originalTimeout(callback, milliseconds === 120_000 ? 1 : milliseconds, ...args),
      );
    const first = scope.service.apply(1, { targetHost: scope.newHost, mqttServerId: 2 }, scope.principal);
    const rejected = expect(first).rejects.toThrow('incomplete');
    await rejected;
    timeout.mockRestore();
    expect((await scope.service.status(1)).operation).toMatchObject({ phase: 'verifying', failure: 'broker_verification' });
    const previousDigest = createHash('sha256').update(scope.payloads[0]).digest('hex');
    scope.brokerHost = 'corrected-broker.test';
    scope.provision.mockResolvedValueOnce({ username: 'wago-controller-cc100-1', password: 'replacement-device-secret' });
    scope.failure = 'apply';
    const restarted = new WagoNetworkChangeService(scope.context, scope.managed, scope.wago as unknown as WagoService);
    await expect(restarted.apply(1, null, scope.principal, true)).rejects.toThrow('incomplete');
    const replacement = JSON.parse(scope.payloads[1].toString());
    expect(replacement).toMatchObject({
      url: 'mqtt://corrected-broker.test:1883',
      password: 'replacement-device-secret',
      supersededDigest: previousDigest,
    });
    expect(replacement.operationToken).not.toBe(JSON.parse(scope.payloads[0].toString()).operationToken);
    expect(
      jest
        .mocked(managedSsh)
        .mock.calls.some(
          (call) =>
            call[2] ===
            `mqtt-release ${call[0].token} ${previousDigest} ${createHash('sha256').update(scope.payloads[1]).digest('hex')}`,
        ),
    ).toBe(true);
    scope.failure = null;
    scope.allowEvidence = true;
    scope.brokerHost = 'another-edit.test'; // An interrupted recreation must finish its durable replacement first.
    expect(await restarted.apply(1, null, scope.principal, true)).toMatchObject({ operation: { phase: 'completed' } });
    expect(scope.payloads[2]).toEqual(scope.payloads[1]);
    expect(scope.provision).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(await scope.service.status(1)) + JSON.stringify(scope.audit.mock.calls)).not.toContain(
      'replacement-device-secret',
    );
  });
}
