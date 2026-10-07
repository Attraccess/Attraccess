import { MqttServer } from '@attraccess/database-entities';
import { MqttServerController } from '../mqtt/servers/mqtt-server.controller';
import { registerAdministrationLifecycleHooksFixture } from './audit-administration-lifecycle.administration-lifecycle-hooks.test-fixture';
import { SettingsController } from '../settings/settings.controller';
import { PluginController } from '../plugin-system/plugin.controller';
import { NpmPluginAuditState } from '../plugin-system/npm-plugin.service';

export function registerAwaitsMqttRecordingCoversCreateUpdateDeleteAndExcludesCredentialsAndCertifCases(
  fixture: ReturnType<typeof registerAdministrationLifecycleHooksFixture>,
) {
  it('awaits MQTT recording, covers create/update/delete, and excludes credentials and certificates', async () => {
    const server = {
      id: 7,
      name: 'Workshop',
      host: 'mqtt.example',
      port: 8883,
      username: fixture.secret,
      password: fixture.secret,
      caCert: fixture.secret,
      useTls: true,
      defaultPublishQos: 1,
      defaultPublishRetain: false,
      defaultSubscribeQos: 1,
    } as MqttServer;
    const service = {
      create: jest.fn().mockResolvedValue(server),
      update: jest.fn().mockResolvedValue(server),
      findOne: jest.fn().mockResolvedValue(server),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const audit = fixture.recorder();
    let finish: () => void;
    audit.recordAdministration.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new MqttServerController(service as never, audit as never);
    let returned = false;
    const pending = controller.createOne({ password: fixture.secret } as never, fixture.req).then(() => {
      returned = true;
    });
    await new Promise(setImmediate);
    expect(returned).toBe(false);
    finish();
    await pending;
    await controller.updateOne(7, { password: fixture.secret } as never, fixture.req);
    await controller.deleteOne(7, fixture.req);
    expect(fixture.recorded(audit).map((event) => event.action)).toEqual([
      'mqtt_server.created',
      'mqtt_server.updated',
      'mqtt_server.deleted',
    ]);
    expect(fixture.recorded(audit)[1]).toMatchObject({
      actorId: 42,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
      details: { passwordChanged: 1 },
    });
    audit.recordAdministration.mockRejectedValueOnce(new Error(fixture.secret));
    await expect(controller.updateOne(7, {} as never, fixture.req)).resolves.toBe(server);
    service.update.mockRejectedValueOnce(new Error('primary failure'));
    audit.recordAdministration.mockClear();
    await expect(controller.updateOne(7, {} as never, fixture.req)).rejects.toThrow('primary failure');
    expect(audit.recordAdministration).not.toHaveBeenCalled();
  });
}

export function registerRecordsAuditMetricsAndRateLimitChangesUsingTheExactSupportedSettingKeysCases(
  fixture: ReturnType<typeof registerAdministrationLifecycleHooksFixture>,
) {
  it('records audit, metrics and rate-limit changes using the exact supported setting keys', async () => {
    const audit = fixture.recorder();
    const service = {
      getAuditSettings: jest.fn().mockResolvedValue({ enabled: true, domains: ['administration'], retention_days: 90 }),
      updateAuditSettings: jest
        .fn()
        .mockResolvedValue({ enabled: true, domains: ['administration'], retention_days: 30 }),
      getAuthRateLimitSettings: jest.fn().mockResolvedValue({ maxAttempts: 5, exponentialBackoff: false }),
      updateAuthRateLimitSettings: jest.fn().mockResolvedValue({ maxAttempts: 3, exponentialBackoff: true }),
      getMessagingRateLimitSettings: jest.fn().mockResolvedValue({ sendMaxPerWindow: 30 }),
      updateMessagingRateLimitSettings: jest.fn().mockResolvedValue({ sendMaxPerWindow: 20 }),
      getMetricsApiKey: jest.fn().mockResolvedValue({ configured: true }),
      getMetricsToggles: jest.fn().mockResolvedValueOnce({ http: true }).mockResolvedValueOnce({ http: false }),
      getMetricsSlowQueryThresholdSeconds: jest.fn().mockResolvedValue(1),
      updateMetricsToggles: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new SettingsController(service as never, audit as never);
    await controller.updateAuditSettings({ retention_days: 30 }, fixture.req);
    await controller.updateAuthRateLimitSettings({ maxAttempts: 3, exponentialBackoff: true }, fixture.req);
    await controller.updateMessagingRateLimitSettings({ sendMaxPerWindow: 20 }, fixture.req);
    await controller.updateMetricsSettings({ toggles: { http: false } }, fixture.req);
    expect(fixture.recorded(audit).map((event) => event.details.settingKey)).toEqual([
      'audit.retention_days',
      'auth.rateLimit.maxAttempts',
      'auth.rateLimit.exponentialBackoff',
      'messaging.rateLimit.sendMaxPerWindow',
      'metrics.toggles.http',
    ]);
  });
}

export function registerRecordsObservedInstallReplacementOutcomesAndPreservesFailedOperationErrorsWCases(
  fixture: ReturnType<typeof registerAdministrationLifecycleHooksFixture>,
) {
  it('records observed install/replacement outcomes and preserves failed-operation errors without persisting their text', async () => {
    const audit = fixture.recorder();
    const npm = {
      listInstalled: jest.fn().mockReturnValue([{ ...fixture.plugin, version: '1.0.0' }]),
      install: jest.fn(async (_name, _spec, _registry, state: NpmPluginAuditState) => {
        Object.assign(state, {
          newVersion: '2.0.0',
          registryUrl: fixture.plugin.registryUrl,
          integrityResult: 'verified',
          permissionAdditions: '["resources.read"]',
          permissionRemovals: '[]',
          migrationOutcome: 'pending-restart',
          activationOutcome: 'restart-requested',
          restartRequested: 1,
        });
        return fixture.plugin;
      }),
      replaceInstalled: jest.fn(async (_name, _version, _permissions, _major, state: NpmPluginAuditState) => {
        Object.assign(state, { newVersion: '2.0.0', activationOutcome: 'failed', rollbackOutcome: 'succeeded' });
        throw new Error(fixture.secret);
      }),
    };
    const controller = new PluginController({ requestRestart: jest.fn() } as never, npm as never, audit as never);
    await controller.installPackage(fixture.plugin.name, '2.0.0', { registryId: 'default' }, fixture.req);
    await expect(
      controller.replaceInstalledPackage(
        fixture.plugin.name,
        '2.0.0',
        { approvedPermissionAdditions: [], approvedMajorVersion: true },
        fixture.req,
      ),
    ).rejects.toThrow(fixture.secret);
    const events = fixture.recorded(audit);
    expect(events[0]).toMatchObject({
      outcome: 'succeeded',
      details: { migrationOutcome: 'pending-restart', provenanceResult: 'not-verified' },
    });
    expect(events[1]).toMatchObject({
      outcome: 'failed',
      details: { oldVersion: '1.0.0', newVersion: '2.0.0', rollbackOutcome: 'succeeded' },
    });
  });
}

export function registerRecordsRegistryLifecyclePackageConfigurationAndRemovalUsingSafeIdentifiersCases(
  fixture: ReturnType<typeof registerAdministrationLifecycleHooksFixture>,
) {
  it('records registry lifecycle, package configuration and removal using safe identifiers', async () => {
    const audit = fixture.recorder();
    const npm = {
      addRegistry: jest
        .fn()
        .mockResolvedValue({ id: 'private', name: 'Private', url: fixture.plugin.registryUrl, token: fixture.secret }),
      testRegistry: jest.fn().mockResolvedValue(undefined),
      removeRegistry: jest.fn().mockResolvedValue(undefined),
      listInstalled: jest.fn().mockReturnValue([fixture.plugin]),
      removeInstalled: jest.fn().mockResolvedValue(undefined),
      updateRequestedSpec: jest.fn().mockResolvedValue(fixture.plugin),
      updateOverride: jest.fn().mockResolvedValue(fixture.plugin),
      updateVersionPolicy: jest.fn().mockResolvedValue(fixture.plugin),
      checkInstalled: jest.fn().mockResolvedValue({
        ...fixture.plugin,
        updateCheck: { candidate: '2.1.0', state: 'available', error: fixture.secret },
      }),
      setUpdatePolicy: jest.fn().mockResolvedValue({
        checksEnabled: true,
        mode: 'minor',
        maintenanceWindow: { startMinute: 180, durationMinutes: 60 },
        prerelease: false,
      }),
    };
    const controller = new PluginController({ requestRestart: jest.fn() } as never, npm as never, audit as never);
    await controller.addRegistry(
      { name: 'Private', url: fixture.plugin.registryUrl, token: fixture.secret },
      fixture.req,
    );
    await controller.testRegistry('private', fixture.req);
    await controller.removeRegistry('private', fixture.req);
    await controller.updateInstalledPackageSpec(fixture.plugin.name, fixture.plugin.requestedSpec, fixture.req);
    await controller.updateInstalledPackageOverride(fixture.plugin.name, 'inherit', fixture.req);
    await controller.updateInstalledPackagePolicy(
      fixture.plugin.name,
      { requestedSpec: fixture.plugin.requestedSpec, updateOverride: 'inherit' },
      fixture.req,
    );
    await controller.setUpdatePolicy({}, fixture.req);
    await controller.checkInstalledPackage(fixture.plugin.name, fixture.req);
    await controller.removeInstalledPackage(fixture.plugin.name, fixture.req);
    const events = fixture.recorded(audit);
    expect(events).toHaveLength(9);
    expect(events.at(-1)).toMatchObject({
      details: { oldVersion: '2.0.0', permissionRemovals: '["resources.read"]', migrationOutcome: 'not-applicable' },
    });
    expect(events[3].details).not.toHaveProperty('migrationOutcome');
    expect(events[3].details).not.toHaveProperty('restartRequested');
  });
}
