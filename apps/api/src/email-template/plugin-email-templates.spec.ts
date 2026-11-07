import type { PluginEmailTemplate } from '@attraccess/plugins-backend-sdk';
import {
  getPluginEmailTemplate,
  listPluginEmailTemplates,
  pluginEmailTemplatesVersion,
  registerPluginEmailTemplates,
  unregisterPluginEmailTemplates,
} from './plugin-email-templates';

const template = (patch: Partial<PluginEmailTemplate> = {}): PluginEmailTemplate => ({
  id: 'confirmed',
  label: { en: 'Confirmed', de: 'Bestätigt' },
  variables: ['reservation.when'],
  subject: '{{t "subject" "Confirmed: {resource}" resource=resource.name}}',
  body: '<mj-section><mj-column><mj-text>{{t "body" "Booked {when}" when=reservation.when}}</mj-text></mj-column></mj-section>',
  translations: { de: { subject: 'Bestätigt: {resource}', body: 'Gebucht {when}' } },
  ...patch,
});

describe('plugin email template registry', () => {
  afterEach(() => unregisterPluginEmailTemplates('demo'));

  it('namespaces the key as plugin.<plugin>.<id> and lists the template', () => {
    registerPluginEmailTemplates('demo', [template()]);
    expect(getPluginEmailTemplate('plugin.demo.confirmed')).toMatchObject({
      pluginName: 'demo',
      id: 'confirmed',
      label: { en: 'Confirmed', de: 'Bestätigt' },
    });
    expect(listPluginEmailTemplates().map((entry) => entry.key)).toContain('plugin.demo.confirmed');
  });

  it('replaces an earlier registration of the same plugin and bumps the version', () => {
    registerPluginEmailTemplates('demo', [template()]);
    const before = pluginEmailTemplatesVersion();
    registerPluginEmailTemplates('demo', [template({ id: 'other' })]);
    expect(getPluginEmailTemplate('plugin.demo.confirmed')).toBeUndefined();
    expect(getPluginEmailTemplate('plugin.demo.other')).toBeDefined();
    expect(pluginEmailTemplatesVersion()).toBeGreaterThan(before);
  });

  it.each([
    ['an invalid id', { id: 'Not Valid' }, /invalid email template id/],
    ['a missing German label', { label: { en: 'x' } as never }, /label\.en and label\.de/],
    ['a variables list that is not strings', { variables: [1] as never }, /variables/],
    ['an empty subject', { subject: ' ' }, /subject/],
    ['a subject longer than the column', { subject: 'x'.repeat(256) }, /subject/],
    ['an empty body', { body: '' }, /body/],
    ['a full mjml document as body', { body: '<mjml><mj-body></mj-body></mjml>' }, /MJML fragment/],
    ['no German translations', { translations: {} as never }, /translations\.de/],
    [
      'a translation key without German text',
      { translations: { de: { subject: 'x' } } },
      /no German translation for: body/,
    ],
  ])('rejects %s', (_name, patch, message) => {
    expect(() => registerPluginEmailTemplates('demo', [template(patch as Partial<PluginEmailTemplate>)])).toThrow(
      message,
    );
    expect(listPluginEmailTemplates().filter((entry) => entry.pluginName === 'demo')).toEqual([]);
  });

  it('rejects the same id twice and keeps the earlier registration', () => {
    registerPluginEmailTemplates('demo', [template()]);
    expect(() => registerPluginEmailTemplates('demo', [template(), template()])).toThrow(/twice/);
    expect(getPluginEmailTemplate('plugin.demo.confirmed')).toBeDefined();
  });
});
