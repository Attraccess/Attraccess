import { EmailTemplate, EmailTemplateTranslation, EmailTemplateType } from '@attraccess/database-entities';
import type { PluginEmailTemplate } from '@attraccess/plugins-backend-sdk';
import { DataSource } from 'typeorm';
import { EmailTemplateService } from './email-template.service';
import { MjmlService } from './mjml.service';
import { registerPluginEmailTemplates, unregisterPluginEmailTemplates } from './plugin-email-templates';

const KEY = 'plugin.demo.confirmed' as EmailTemplateType;

const declared = (patch: Partial<PluginEmailTemplate> = {}): PluginEmailTemplate => ({
  id: 'confirmed',
  label: { en: 'Confirmed', de: 'Bestätigt' },
  variables: ['reservation.when'],
  subject: '{{t "subject" "Confirmed: {resource}" resource=resource.name}}',
  body: '<mj-section><mj-column><mj-text>{{t "body" "Booked {when}" when=reservation.when}}</mj-text></mj-column></mj-section>',
  translations: { de: { subject: 'Bestätigt: {resource}', body: 'Gebucht {when}' } },
  ...patch,
});

describe('EmailTemplateService with plugin templates (real SQLite)', () => {
  let dataSource: DataSource;
  let service: EmailTemplateService;

  const stored = () => dataSource.getRepository(EmailTemplate).findOneBy({ type: KEY });
  const translations = async () =>
    Object.fromEntries(
      (await dataSource.getRepository(EmailTemplateTranslation).findBy({ templateType: KEY })).map((row) => [
        `${row.locale}:${row.key}`,
        row.value,
      ]),
    );

  beforeEach(async () => {
    dataSource = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      entities: [EmailTemplate, EmailTemplateTranslation],
    }).initialize();
    service = new EmailTemplateService(
      dataSource.getRepository(EmailTemplate),
      dataSource.getRepository(EmailTemplateTranslation),
      new MjmlService(),
    );
    registerPluginEmailTemplates('demo', [declared()]);
  });

  afterEach(async () => {
    unregisterPluginEmailTemplates('demo');
    await dataSource.destroy();
  });

  it('seeds the declared template and its shipped translations on first use', async () => {
    await service.onApplicationBootstrap();
    expect(await stored()).toMatchObject({ subject: declared().subject, variables: ['reservation.when'] });
    expect(await translations()).toEqual({ 'de:subject': 'Bestätigt: {resource}', 'de:body': 'Gebucht {when}' });
  });

  it('is idempotent and never overwrites admin edits', async () => {
    await service.onApplicationBootstrap();
    await service.update(KEY, {
      subject: 'Admin subject',
      body: '<mj-section><mj-column><mj-text>Mine</mj-text></mj-column></mj-section>',
    });
    await service.setTranslations(KEY, 'de', { subject: 'Admin Betreff' });

    registerPluginEmailTemplates('demo', [
      declared({ subject: '{{t "subject" "New default"}}', translations: { de: { subject: 'Neu', body: 'Neu' } } }),
    ]);
    await service.findOne(KEY);

    expect(await stored()).toMatchObject({ subject: 'Admin subject' });
    expect((await stored())?.body).toContain('Mine');
    // the admin's German subject stays; a shipped key the admin's set lacks is added
    expect(await translations()).toEqual({ 'de:subject': 'Admin Betreff', 'de:body': 'Neu' });
  });

  it('follows a changed variable list of the declaration', async () => {
    await service.onApplicationBootstrap();
    registerPluginEmailTemplates('demo', [declared({ variables: ['reservation.when', 'resource.name'] })]);
    expect((await service.findOne(KEY)).variables).toEqual(['reservation.when', 'resource.name']);
  });

  it('lists plugin templates tagged with their plugin next to core ones, and hides those of unloaded plugins', async () => {
    await dataSource.getRepository(EmailTemplate).insert({
      type: EmailTemplateType.VERIFY_EMAIL,
      subject: 'Core',
      body: '<mj-section></mj-section>',
      variables: [],
    });
    await service.onApplicationBootstrap();
    const listed = await service.findAll();
    expect(listed.find((item) => item.type === EmailTemplateType.VERIFY_EMAIL)?.plugin).toBeUndefined();
    expect(listed.find((item) => item.type === KEY)?.plugin).toEqual({
      name: 'demo',
      label: { en: 'Confirmed', de: 'Bestätigt' },
    });

    unregisterPluginEmailTemplates('demo');
    expect((await service.findAll()).map((item) => item.type)).toEqual([EmailTemplateType.VERIFY_EMAIL]);
    await expect(service.findOne(KEY)).rejects.toThrow('not found');
  });

  it('resets a plugin template to the declared default and shipped translations', async () => {
    await service.onApplicationBootstrap();
    await service.update(KEY, { subject: 'Admin subject' });
    await service.setTranslations(KEY, 'de', { subject: 'Admin Betreff' });
    const reset = await service.resetToDefault(KEY);
    expect(reset.subject).toBe(declared().subject);
    expect(await translations()).toEqual({ 'de:subject': 'Bestätigt: {resource}', 'de:body': 'Gebucht {when}' });
  });

  it('does not register a template whose MJML is invalid, and keeps the others', async () => {
    registerPluginEmailTemplates('demo', [
      declared({ id: 'broken', body: '<mj-invalid-tag>Hello</mj-invalid-tag>' }),
      declared(),
    ]);
    await service.onApplicationBootstrap();
    expect(await dataSource.getRepository(EmailTemplate).findOneBy({ type: 'plugin.demo.broken' as never })).toBeNull();
    expect(await stored()).not.toBeNull();
  });

  it('merges the shipped German text with regional locales like core templates', async () => {
    await service.onApplicationBootstrap();
    expect(await service.getTranslationsMap(KEY, 'de-AT')).toEqual({
      subject: 'Bestätigt: {resource}',
      body: 'Gebucht {when}',
    });
  });
});
