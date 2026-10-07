import type { ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope } from './audit-hooks.integration.spec';
export function registerBoundsAStalledRotationDispatchAndRetainsEncryptedRecovery(
  scope: ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope,
): void {
  it('bounds a stalled rotation dispatch and retains encrypted recovery', async () => {
    const controller = await scope.deliverAndClaim();
    await scope.rotationReady(controller);
    const rotate = scope.observeRotationProvider();
    scope.mqtt.publish.mockImplementation(() => new Promise(() => undefined));
    const started = Date.now();
    await scope.post(`controllers/${controller.id}/credentials/rotate`, { confirm: true }).expect(409);
    expect(Date.now() - started).toBeGreaterThanOrEqual(29_000);
    expect(Date.now() - started).toBeLessThan(40_000);
    expect(rotate).toHaveBeenCalledTimes(1);
    expect((await scope.rotationRecord(controller.id)).phase).toBe('pending');
    expect((await scope.rotationRecord(controller.id)).encryptedCredentials).not.toContain(scope.privateValue);
    await scope.lifecycle('credential_rotation', controller.id, 'failed');
  }, 45_000);
}
