import { PluginService } from '../plugin-system/plugin.service';
import { EmailTemplateType, MqttServer } from '@attraccess/database-entities';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { SettingsController } from '../settings/settings.controller';
import { EmailTemplateController } from '../email-template/email-template.controller';
import { EmailLayoutController } from '../email-layout/email-layout.controller';
import { MqttServerController } from '../mqtt/servers/mqtt-server.controller';
import { PluginController } from '../plugin-system/plugin.controller';
import { InstalledNpmPlugin, NpmPluginAuditState } from '../plugin-system/npm-plugin.service';
import { projectAdministrationAuditEvent } from './audit-administration-policy';

const req = { user: { id: 42, authenticationMethod: 'api-token', apiTokenId: 9 } } as AuthenticatedRequest;
const secret = 'SECRET_MUST_NOT_BE_RECORDED';
const plugin = {
  name: '@attraccess/example',
  version: '2.0.0',
  requestedSpec: '^2.0.0',
  registryId: 'default',
  registryUrl: `https://user:${secret}@registry.example/private?token=${secret}`,
  integrity: 'sha512-YWJj',
  permissions: ['resources.read'],
  state: 'active',
  installPath: '/private/plugins/example',
  classification: 'community',
} as InstalledNpmPlugin;

function recorder() {
  return { recordAdministration: jest.fn().mockResolvedValue(undefined) };
}
function recorded(audit: ReturnType<typeof recorder>) {
  const events = audit.recordAdministration.mock.calls.map(([event]) => event);
  for (const event of events) expect(projectAdministrationAuditEvent(event)).not.toBeNull();
  expect(JSON.stringify(events)).not.toContain(secret);
  return events;
}

describe('administration lifecycle hooks', () => {
  it('awaits MQTT recording, covers create/update/delete, and excludes credentials and certificates', async () => {
    const server = {
      id: 7,
      name: 'Workshop',
      host: 'mqtt.example',
      port: 8883,
      username: secret,
      password: secret,
      caCert: secret,
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
    const audit = recorder();
    let finish: () => void;
    audit.recordAdministration.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new MqttServerController(service as never, audit as never);
    let returned = false;
    const pending = controller.createOne({ password: secret } as never, req).then(() => {
      returned = true;
    });
    await new Promise(setImmediate);
    expect(returned).toBe(false);
    finish();
    await pending;
    await controller.updateOne(7, { password: secret } as never, req);
    await controller.deleteOne(7, req);
    expect(recorded(audit).map((event) => event.action)).toEqual([
      'mqtt_server.created',
      'mqtt_server.updated',
      'mqtt_server.deleted',
    ]);
    expect(recorded(audit)[1]).toMatchObject({
      actorId: 42,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
      details: { passwordChanged: 1 },
    });
    audit.recordAdministration.mockRejectedValueOnce(new Error(secret));
    await expect(controller.updateOne(7, {} as never, req)).resolves.toBe(server);
    service.update.mockRejectedValueOnce(new Error('primary failure'));
    audit.recordAdministration.mockClear();
    await expect(controller.updateOne(7, {} as never, req)).rejects.toThrow('primary failure');
    expect(audit.recordAdministration).not.toHaveBeenCalled();
  });

  it('records template and layout edits, resets and translations without body content', async () => {
    const audit = recorder();
    const service = {
      update: jest.fn().mockResolvedValue({ body: secret }),
      resetToDefault: jest.fn().mockResolvedValue({ body: secret }),
      setTranslations: jest.fn().mockResolvedValue(undefined),
      deleteTranslations: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new EmailTemplateController(service as never, audit as never);
    const type = EmailTemplateType.RESET_PASSWORD;
    await controller.update(type, { subject: secret, body: secret } as never, req);
    await controller.resetToDefault(type, req);
    await controller.setTranslations(type, { locale: 'de', translations: { greeting: secret } }, req);
    await controller.deleteTranslations(type, 'de', req);
    const layout = new EmailLayoutController(service as never, audit as never);
    await layout.update({ body: secret }, req);
    await layout.resetToDefault(req);
    expect(recorded(audit).map((event) => event.action)).toEqual([
      'email_template.updated',
      'email_template.reset',
      'email_template.translations_set',
      'email_template.translations_deleted',
      'email_layout.updated',
      'email_layout.reset',
    ]);
  });

  it('records setting keys, safe before/after values and credential rotation without secret material', async () => {
    const before = {
      app: { url: 'https://old.example', publicInternetUrl: null, licenseKeyConfigured: true },
      smtp: {
        host: 'old.example',
        port: 25,
        secure: false,
        service: 'SMTP',
        from: 'a@example.com',
        user: secret,
        passConfigured: true,
      },
    };
    const after = {
      app: { ...before.app, url: `https://user:${secret}@new.example/private?token=${secret}` },
      smtp: { ...before.smtp, port: 465, secure: true },
    };
    const service = {
      getSystemSettings: jest.fn().mockResolvedValue(before),
      updateSystemSettings: jest.fn().mockResolvedValue(after),
      generateMetricsApiKey: jest.fn().mockResolvedValue({ apiKey: secret }),
      setMetricsApiKey: jest.fn().mockResolvedValue(undefined),
      getMetricsApiKey: jest.fn().mockResolvedValue({ configured: false }),
      getMetricsToggles: jest.fn().mockResolvedValue({ http: false }),
      getMetricsSlowQueryThresholdSeconds: jest.fn().mockResolvedValue(1),
    };
    const audit = recorder();
    const controller = new SettingsController(service as never, audit as never);
    await controller.updateSystemSettings({ app: { licenseKey: secret }, smtp: { pass: secret } } as never, req);
    await expect(controller.generateMetricsApiKey(req)).resolves.toMatchObject({ apiKey: secret });
    await controller.deleteMetricsApiKey(req);
    const events = recorded(audit);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          details: { settingKey: 'app.url', before: 'https://old.example', after: 'https://new.example' },
        }),
        expect.objectContaining({ details: { settingKey: 'smtp.passwordChanged', before: 'false', after: 'true' } }),
        expect.objectContaining({
          action: 'settings.api_key.generated',
          details: { settingKey: 'metrics.apiKeyConfigured', configured: 1 },
        }),
        expect.objectContaining({
          action: 'settings.api_key.deleted',
          details: { settingKey: 'metrics.apiKeyConfigured', configured: 0 },
        }),
      ]),
    );
  });

  it('records audit, metrics and rate-limit changes using the exact supported setting keys', async () => {
    const audit = recorder();
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
    await controller.updateAuditSettings({ retention_days: 30 }, req);
    await controller.updateAuthRateLimitSettings({ maxAttempts: 3, exponentialBackoff: true }, req);
    await controller.updateMessagingRateLimitSettings({ sendMaxPerWindow: 20 }, req);
    await controller.updateMetricsSettings({ toggles: { http: false } }, req);
    expect(recorded(audit).map((event) => event.details.settingKey)).toEqual([
      'audit.retention_days',
      'auth.rateLimit.maxAttempts',
      'auth.rateLimit.exponentialBackoff',
      'messaging.rateLimit.sendMaxPerWindow',
      'metrics.toggles.http',
    ]);
  });

  it('records ZIP upload/deletion and retry without archive content or raw errors', async () => {
    const audit = recorder();
    const manifest = { id: 'zip-plugin', name: 'Example', version: '1.0.0', pluginDirectory: 'example' };
    const service = {
      uploadPlugin: jest.fn().mockResolvedValue(manifest),
      deletePlugin: jest.fn().mockResolvedValue(undefined),
      requestRestart: jest.fn(),
    };
    const npm = { findInstalledByPluginId: jest.fn(), listInstalled: jest.fn().mockReturnValue([]) };
    const controller = new PluginController(service as never, npm as never, audit as never);
    const get = jest.spyOn(PluginService, 'getManifestById').mockReturnValue(manifest as never);
    const quarantined = jest.spyOn(PluginService, 'isPluginQuarantined').mockReturnValue(true);
    const clear = jest.spyOn(PluginService, 'clearPluginQuarantine').mockImplementation(() => undefined);
    try {
      await controller.uploadPlugin(
        { originalname: 'example.zip', buffer: Buffer.from(secret) } as never,
        {} as never,
        req,
      );
      await controller.deletePlugin('zip-plugin', req);
      await controller.retryPlugin('zip-plugin', req);
      expect(recorded(audit).map((event) => event.action)).toEqual([
        'plugin.zip_uploaded',
        'plugin.zip_deleted',
        'plugin.retry_requested',
      ]);
    } finally {
      get.mockRestore();
      quarantined.mockRestore();
      clear.mockRestore();
    }
  });

  it('records registry lifecycle, package configuration and removal using safe identifiers', async () => {
    const audit = recorder();
    const npm = {
      addRegistry: jest
        .fn()
        .mockResolvedValue({ id: 'private', name: 'Private', url: plugin.registryUrl, token: secret }),
      testRegistry: jest.fn().mockResolvedValue(undefined),
      removeRegistry: jest.fn().mockResolvedValue(undefined),
      listInstalled: jest.fn().mockReturnValue([plugin]),
      removeInstalled: jest.fn().mockResolvedValue(undefined),
      updateRequestedSpec: jest.fn().mockResolvedValue(plugin),
      updateOverride: jest.fn().mockResolvedValue(plugin),
      updateVersionPolicy: jest.fn().mockResolvedValue(plugin),
      checkInstalled: jest
        .fn()
        .mockResolvedValue({ ...plugin, updateCheck: { candidate: '2.1.0', state: 'available', error: secret } }),
      setUpdatePolicy: jest.fn().mockResolvedValue({
        checksEnabled: true,
        mode: 'minor',
        maintenanceWindow: { startMinute: 180, durationMinutes: 60 },
        prerelease: false,
      }),
    };
    const controller = new PluginController({ requestRestart: jest.fn() } as never, npm as never, audit as never);
    await controller.addRegistry({ name: 'Private', url: plugin.registryUrl, token: secret }, req);
    await controller.testRegistry('private', req);
    await controller.removeRegistry('private', req);
    await controller.updateInstalledPackageSpec(plugin.name, plugin.requestedSpec, req);
    await controller.updateInstalledPackageOverride(plugin.name, 'inherit', req);
    await controller.updateInstalledPackagePolicy(
      plugin.name,
      { requestedSpec: plugin.requestedSpec, updateOverride: 'inherit' },
      req,
    );
    await controller.setUpdatePolicy({}, req);
    await controller.checkInstalledPackage(plugin.name, req);
    await controller.removeInstalledPackage(plugin.name, req);
    const events = recorded(audit);
    expect(events).toHaveLength(9);
    expect(events.at(-1)).toMatchObject({
      details: { oldVersion: '2.0.0', permissionRemovals: '["resources.read"]', migrationOutcome: 'not-applicable' },
    });
    expect(events[3].details).not.toHaveProperty('migrationOutcome');
    expect(events[3].details).not.toHaveProperty('restartRequested');
  });

  it('records observed install/replacement outcomes and preserves failed-operation errors without persisting their text', async () => {
    const audit = recorder();
    const npm = {
      listInstalled: jest.fn().mockReturnValue([{ ...plugin, version: '1.0.0' }]),
      install: jest.fn(async (_name, _spec, _registry, state: NpmPluginAuditState) => {
        Object.assign(state, {
          newVersion: '2.0.0',
          registryUrl: plugin.registryUrl,
          integrityResult: 'verified',
          permissionAdditions: '["resources.read"]',
          permissionRemovals: '[]',
          migrationOutcome: 'pending-restart',
          activationOutcome: 'restart-requested',
          restartRequested: 1,
        });
        return plugin;
      }),
      replaceInstalled: jest.fn(async (_name, _version, _permissions, _major, state: NpmPluginAuditState) => {
        Object.assign(state, { newVersion: '2.0.0', activationOutcome: 'failed', rollbackOutcome: 'succeeded' });
        throw new Error(secret);
      }),
    };
    const controller = new PluginController({ requestRestart: jest.fn() } as never, npm as never, audit as never);
    await controller.installPackage(plugin.name, '2.0.0', { registryId: 'default' }, req);
    await expect(
      controller.replaceInstalledPackage(
        plugin.name,
        '2.0.0',
        { approvedPermissionAdditions: [], approvedMajorVersion: true },
        req,
      ),
    ).rejects.toThrow(secret);
    const events = recorded(audit);
    expect(events[0]).toMatchObject({
      outcome: 'succeeded',
      details: { migrationOutcome: 'pending-restart', provenanceResult: 'not-verified' },
    });
    expect(events[1]).toMatchObject({
      outcome: 'failed',
      details: { oldVersion: '1.0.0', newVersion: '2.0.0', rollbackOutcome: 'succeeded' },
    });
  });
});
