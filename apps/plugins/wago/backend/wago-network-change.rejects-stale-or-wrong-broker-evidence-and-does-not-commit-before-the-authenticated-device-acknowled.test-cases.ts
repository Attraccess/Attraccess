import type { SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope } from "./wago-network-change.spec";
export function registerRejectsStaleOrWrongBrokerEvidenceAndDoesNotCommitBeforeTheAuthenticatedDeviceAcknowled(scope: SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope): void {
it('rejects stale or wrong-broker evidence and does not commit before the authenticated device acknowledgement', async () => {
    scope.allowEvidence = false;
    const result = scope.service.apply(1, { targetHost: scope.newHost, mqttServerId: 2 }, scope.principal);
    for (let i = 0; i < 50 && scope.payloads.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    const payload = JSON.parse(scope.payloads[0].toString()),
      topic = `${payload.prefix}/v1/controllers/${payload.hardwareId}/credentials/rotate/ack`;
    const ack = { revision: 1, token: payload.token, credentialEpoch: payload.credentialEpoch, status: 'reconnected' };
    scope.listener({ serverId: 1, topic, payload: Buffer.from(JSON.stringify(ack)) });
    scope.listener({ serverId: 2, topic, payload: Buffer.from(JSON.stringify({ ...ack, token: 'old-token' })) });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await scope.service.status(1)).toMatchObject({ mqttServerId: 1, targetHost: scope.oldHost });
    scope.listener({ serverId: 2, topic, payload: Buffer.from(JSON.stringify(ack)) });
    expect(await result).toMatchObject({ mqttServerId: 2, operation: { phase: 'completed' } });
  });
}
