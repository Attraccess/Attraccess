import type { ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope } from './audit-hooks.integration.spec';
export function registerPersistsAnAuthenticatedManualCommandWithItsRealDispatchedUuidAndSResult(
  scope: ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope,
): void {
  it.each(['accepted', 'rejected', 'transport_failure', 'timeout', 'stalled_dispatch', 'shutdown'] as const)(
    'persists an authenticated manual command with its real dispatched UUID and %s result',
    async (status) => {
      const controller = await scope.deliverAndClaim();
      const revision = await scope.saveAndPublish(controller.id);
      await scope.wago['onConfigurationReported'](
        controller.id,
        Buffer.from(JSON.stringify({ revision: revision.revision, contentHash: revision.contentHash })),
      );
      let commandId: string;
      scope.mqtt.publish.mockImplementation(async (_server, topic, payload) => {
        if (!topic.endsWith('/commands')) return;
        const command = JSON.parse(payload.toString());
        commandId = command.id;
        expect((await scope.rows('manual_command')).map((row) => row.outcome)).toEqual(['attempted']);
        expect((await scope.rows('manual_command'))[0].details).toEqual({
          commandId,
          channelId: 'output',
          operation: 'set',
        });
        if (status === 'transport_failure') throw new Error(scope.privateValue);
        if (status === 'timeout') return;
        if (status === 'stalled_dispatch') return new Promise<void>(() => undefined);
        if (status === 'shutdown') {
          scope.wago.onModuleDestroy();
          return;
        }
        const acknowledgement = { id: commandId, status, message: scope.privateValue };
        await scope.mqtt.receive(`attraccess/wago/v1/controllers/other-controller/acknowledgements`, acknowledgement);
        expect(await scope.rows('manual_command')).toHaveLength(1);
        await scope.mqtt.receive(
          `attraccess/wago/v1/controllers/${controller.hardwareId}/acknowledgements`,
          acknowledgement,
        );
      });
      const { body: result } = await scope
        .post(
          `controllers/${controller.id}/commands`,
          {
            channelId: 'output',
            action: 'set',
            value: true,
            expectedConfigurationRevision: revision.revision,
            acknowledgementTimeoutSeconds: 1,
          },
          'command-token',
        )
        .expect(201);
      const expectedResult =
        status === 'accepted'
          ? 'acknowledged'
          : status === 'stalled_dispatch'
            ? 'timeout'
            : status === 'shutdown'
              ? 'transport_failure'
              : status;
      expect(result).toEqual({ commandId, channelId: 'output', operation: 'set', result: expectedResult });
      expect(commandId).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
      await scope.lifecycle('manual_command', controller.id, status === 'accepted' ? 'succeeded' : 'failed', result);
      await scope.mqtt.receive(`attraccess/wago/v1/controllers/${controller.hardwareId}/acknowledgements`, {
        id: commandId,
        status: 'accepted',
      });
      expect(await scope.rows('manual_command')).toHaveLength(2);
      expect(JSON.stringify(await scope.rows('manual_command'))).not.toContain(scope.privateValue);
      expect((await scope.rows('manual_command'))[1].details).not.toHaveProperty('value');
    },
  );
}
