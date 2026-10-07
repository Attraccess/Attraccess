import { SettingsController } from '../settings/settings.controller';
import { registerAdministrationLifecycleHooksFixture } from './audit-administration-lifecycle.administration-lifecycle-hooks.test-fixture';
import { EmailTemplateType } from '@attraccess/database-entities';
import { EmailTemplateController } from '../email-template/email-template.controller';
import { EmailLayoutController } from '../email-layout/email-layout.controller';
import { PluginService } from '../plugin-system/plugin.service';
import { PluginController } from '../plugin-system/plugin.controller';

export function registerRecordsSettingKeysSafeBeforeAfterValuesAndCredentialRotationWithoutSecretCases(
  fixture: ReturnType<typeof registerAdministrationLifecycleHooksFixture>,
) {
  it('records setting keys, safe before/after values and credential rotation without secret material', async () => {
    const before = {
      app: { url: 'https://old.example', publicInternetUrl: null, licenseKeyConfigured: true },
      smtp: {
        host: 'old.example',
        port: 25,
        secure: false,
        service: 'SMTP',
        from: 'a@example.com',
        user: fixture.secret,
        passConfigured: true,
      },
    };
    const after = {
      app: { ...before.app, url: `https://user:${fixture.secret}@new.example/private?token=${fixture.secret}` },
      smtp: { ...before.smtp, port: 465, secure: true },
    };
    const service = {
      getSystemSettings: jest.fn().mockResolvedValue(before),
      updateSystemSettings: jest.fn().mockResolvedValue(after),
      generateMetricsApiKey: jest.fn().mockResolvedValue({ apiKey: fixture.secret }),
      setMetricsApiKey: jest.fn().mockResolvedValue(undefined),
      getMetricsApiKey: jest.fn().mockResolvedValue({ configured: false }),
      getMetricsToggles: jest.fn().mockResolvedValue({ http: false }),
      getMetricsSlowQueryThresholdSeconds: jest.fn().mockResolvedValue(1),
    };
    const audit = fixture.recorder();
    const controller = new SettingsController(service as never, audit as never);
    await controller.updateSystemSettings(
      { app: { licenseKey: fixture.secret }, smtp: { pass: fixture.secret } } as never,
      fixture.req,
    );
    await expect(controller.generateMetricsApiKey(fixture.req)).resolves.toMatchObject({ apiKey: fixture.secret });
    await controller.deleteMetricsApiKey(fixture.req);
    const events = fixture.recorded(audit);
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
}

export function registerRecordsTemplateAndLayoutEditsResetsAndTranslationsWithoutBodyContentCases(
  fixture: ReturnType<typeof registerAdministrationLifecycleHooksFixture>,
) {
  it('records template and layout edits, resets and translations without body content', async () => {
    const audit = fixture.recorder();
    const service = {
      update: jest.fn().mockResolvedValue({ body: fixture.secret }),
      resetToDefault: jest.fn().mockResolvedValue({ body: fixture.secret }),
      setTranslations: jest.fn().mockResolvedValue(undefined),
      deleteTranslations: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new EmailTemplateController(service as never, audit as never);
    const type = EmailTemplateType.RESET_PASSWORD;
    await controller.update(type, { subject: fixture.secret, body: fixture.secret } as never, fixture.req);
    await controller.resetToDefault(type, fixture.req);
    await controller.setTranslations(type, { locale: 'de', translations: { greeting: fixture.secret } }, fixture.req);
    await controller.deleteTranslations(type, 'de', fixture.req);
    const layout = new EmailLayoutController(service as never, audit as never);
    await layout.update({ body: fixture.secret }, fixture.req);
    await layout.resetToDefault(fixture.req);
    expect(fixture.recorded(audit).map((event) => event.action)).toEqual([
      'email_template.updated',
      'email_template.reset',
      'email_template.translations_set',
      'email_template.translations_deleted',
      'email_layout.updated',
      'email_layout.reset',
    ]);
  });
}

export function registerRecordsZipUploadDeletionAndRetryWithoutArchiveContentOrRawErrorsCases(
  fixture: ReturnType<typeof registerAdministrationLifecycleHooksFixture>,
) {
  it('records ZIP upload/deletion and retry without archive content or raw errors', async () => {
    const audit = fixture.recorder();
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
        { originalname: 'example.zip', buffer: Buffer.from(fixture.secret) } as never,
        {} as never,
        fixture.req,
      );
      await controller.deletePlugin('zip-plugin', fixture.req);
      await controller.retryPlugin('zip-plugin', fixture.req);
      expect(fixture.recorded(audit).map((event) => event.action)).toEqual([
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
}
