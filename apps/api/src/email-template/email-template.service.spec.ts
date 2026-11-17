import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailTemplateService } from './email-template.service';
import { EmailTemplateType } from '@attraccess/application-models';
import { MjmlService } from './mjml.service';
import { readDefaultTemplateBody } from './email-defaults';
import { FAKE_TEMPLATE_TRANSACTION, FakeEmailTemplateStore } from './fake-email-template-store.test-fixture';

const ACTOR = { id: 1, authenticationMethod: 'session' as const };
const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };

jest.mock('./email-defaults', () => ({
  EMAIL_TEMPLATE_DEFAULTS: { 'verify-email': { subject: 'Default subject', variables: [] } },
  readDefaultTemplateBody: jest.fn(() => '<mjml></mjml>'),
  SHIPPED_TRANSLATIONS: [{ templateType: 'verify-email', locale: 'de', key: 'greeting', value: 'Hallo {name},' }],
}));

const VERIFY = EmailTemplateType.VERIFY_EMAIL;

const setup = () => {
  const store = new FakeEmailTemplateStore();
  const mjmlService = { validateAndConvert: jest.fn() } as unknown as MjmlService;
  const service = new EmailTemplateService(store, mjmlService, audit as never);
  return { service, store, mjmlService };
};

const translation = (key: string, value: string, locale: string) => ({
  key,
  value,
  locale,
  templateType: VERIFY,
});

describe('EmailTemplateService — translation CRUD', () => {
  describe('getTranslationsMap', () => {
    it('returns key→value map for exact locale match', async () => {
      const { service, store } = setup();
      store.translations = [translation('greeting', 'Hallo', 'de')];

      expect(await service.getTranslationsMap(VERIFY, 'de')).toEqual({ greeting: 'Hallo' });
      expect(store.callsOf('findTranslations')[0].args).toEqual([VERIFY, 'de']);
    });

    it('merges base translations with regional overrides per key', async () => {
      const { service, store } = setup();
      store.translations = [
        translation('greeting', 'Hallo', 'de'),
        translation('footer', 'Ignoriere diese E-Mail', 'de'),
        translation('greeting', 'Grüezi', 'de-CH'),
        translation('footer', '', 'de-CH'),
      ];

      // greeting from regional; footer from base (regional empty string skipped)
      expect(await service.getTranslationsMap(VERIFY, 'de-CH')).toEqual({
        greeting: 'Grüezi',
        footer: 'Ignoriere diese E-Mail',
      });
    });

    it('falls back entirely to base when regional locale has no rows', async () => {
      const { service, store } = setup();
      store.translations = [translation('greeting', 'Hallo', 'de')];

      expect(await service.getTranslationsMap(VERIFY, 'de-CH')).toEqual({ greeting: 'Hallo' });
    });

    it('returns empty map when no translations found', async () => {
      const { service } = setup();
      expect(await service.getTranslationsMap(VERIFY, 'fr')).toEqual({});
    });
  });

  describe('setTranslations', () => {
    it('throws NotFoundException for unknown template type', async () => {
      const { service } = setup();
      await expect(
        service.setTranslations('nonexistent' as EmailTemplateType, 'de', { greeting: 'Hallo' }, ACTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('replaces the locale atomically and records the audit event inside the same transaction', async () => {
      const { service, store } = setup();
      store.put(VERIFY);
      store.translations = [translation('old', 'Alt', 'de'), translation('keep', 'Bleibt', 'en')];
      audit.record.mockClear();

      await service.setTranslations(VERIFY, 'de', { greeting: 'Hallo' }, ACTOR);

      expect(store.translations).toEqual([translation('keep', 'Bleibt', 'en'), translation('greeting', 'Hallo', 'de')]);
      expect(store.callsOf('replaceTranslations')[0].args).toEqual([
        VERIFY,
        'de',
        [{ key: 'greeting', value: 'Hallo' }],
      ]);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'email_template.translations_set' }),
        FAKE_TEMPLATE_TRANSACTION,
      );
    });

    it('stores nothing but still clears the locale when data is empty', async () => {
      const { service, store } = setup();
      store.put(VERIFY);
      store.translations = [translation('old', 'Alt', 'de')];

      await service.setTranslations(VERIFY, 'de', {}, ACTOR);

      expect(store.translations).toEqual([]);
    });
  });

  describe('resetToDefault', () => {
    it('restores the defaults and re-seeds shipped translations through the store', async () => {
      const { service, store } = setup();
      store.put(VERIFY);

      (readDefaultTemplateBody as jest.Mock).mockClear();
      await service.resetToDefault(VERIFY, ACTOR);

      expect(readDefaultTemplateBody).toHaveBeenCalledWith('verify-email');
      const [type, defaults, translations] = store.callsOf('restoreDefaults')[0].args;
      expect(type).toBe(VERIFY);
      expect(defaults).toEqual(expect.objectContaining({ body: '<mjml></mjml>', subject: expect.any(String) }));
      expect(translations).toEqual([
        { templateType: 'verify-email', locale: 'de', key: 'greeting', value: 'Hallo {name},' },
      ]);
    });
  });

  describe('resetToDefault with a key that is not a core template type', () => {
    // `constructor` and `toString` are inherited by the defaults map: a plain lookup would have accepted them.
    it.each([
      '../../etc/passwd',
      '..%2f..%2fsecret',
      'verify-email/../layout',
      'unknown-type',
      'constructor',
      'toString',
    ])('never reads a bundled file for %s', async (key) => {
      const { service, store } = setup();
      // Even a stored row (the path parameter is user input) must not make the key a file name.
      store.put(key);
      (readDefaultTemplateBody as jest.Mock).mockClear();

      await expect(service.resetToDefault(key as never, ACTOR)).rejects.toBeInstanceOf(NotFoundException);

      expect(readDefaultTemplateBody).not.toHaveBeenCalled();
      expect(store.callsOf('restoreDefaults')).toHaveLength(0);
    });
  });

  describe('deleteTranslations', () => {
    it('throws NotFoundException for unknown template type', async () => {
      const { service } = setup();
      await expect(service.deleteTranslations('nonexistent' as EmailTemplateType, 'de', ACTOR)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes translations for the given type and locale', async () => {
      const { service, store } = setup();
      store.put(VERIFY);

      await service.deleteTranslations(VERIFY, 'de', ACTOR);

      expect(store.callsOf('deleteTranslations')[0].args).toEqual([VERIFY, 'de']);
    });
  });

  describe('update', () => {
    const FRAGMENT = '<mj-section><mj-column><mj-text>Hi</mj-text></mj-column></mj-section>';

    it('validates fragment bodies wrapped in an <mjml><mj-body> shell', async () => {
      const { service, store, mjmlService } = setup();
      store.put(VERIFY);

      await service.update(VERIFY, { subject: 'S', body: FRAGMENT }, ACTOR);

      expect(mjmlService.validateAndConvert).toHaveBeenCalledWith(`<mjml><mj-body>${FRAGMENT}</mj-body></mjml>`);
      expect(store.callsOf('updateContent')[0].args).toEqual([VERIFY, { subject: 'S', body: FRAGMENT }]);
    });

    it.each([
      ['an empty subject', { subject: ' ', body: FRAGMENT }],
      ['an empty body', { subject: 'S', body: '' }],
      ['a body without MJML elements', { subject: 'S', body: 'just text' }],
      ['a subject with an unclosed block', { subject: '{{#if a}}broken', body: FRAGMENT }],
      ['a body calling an unknown helper', { subject: 'S', body: FRAGMENT.replace('Hi', '{{shout "x"}}') }],
    ])('rejects %s before anything is stored', async (_name, edit) => {
      const { service, store } = setup();
      store.put(VERIFY);

      await expect(service.update(VERIFY, edit, ACTOR)).rejects.toThrow(BadRequestException);
      expect(store.callsOf('updateContent')).toHaveLength(0);
    });

    it('accepts the t helper and block helpers in subject and body', async () => {
      const { service, store } = setup();
      store.put(VERIFY);

      await expect(
        service.update(
          VERIFY,
          {
            subject: '{{#if a}}{{t "s" "Hi {x}" x=a}}{{else}}no{{/if}}',
            body: '<mj-raw>{{#if a}}</mj-raw><mj-section><mj-column><mj-text>{{t "k" "Hi"}}</mj-text></mj-column></mj-section><mj-raw>{{/if}}</mj-raw>',
          },
          ACTOR,
        ),
      ).resolves.toBeDefined();
    });

    it('rejects full <mjml> documents — the send pipeline expects fragments', async () => {
      const { service, store, mjmlService } = setup();
      store.put(VERIFY);

      await expect(
        service.update(VERIFY, { subject: 'S', body: `<mjml><mj-body>${FRAGMENT}</mj-body></mjml>` }, ACTOR),
      ).rejects.toThrow(BadRequestException);

      expect(mjmlService.validateAndConvert).not.toHaveBeenCalled();
      expect(store.callsOf('updateContent')).toHaveLength(0);
    });

    it('propagates MJML validation failures without persisting', async () => {
      const { service, store, mjmlService } = setup();
      store.put(VERIFY);
      (mjmlService.validateAndConvert as jest.Mock).mockRejectedValue(new BadRequestException('bad mjml'));

      await expect(service.update(VERIFY, { subject: 'S', body: '<mj-bogus>' }, ACTOR)).rejects.toThrow(
        BadRequestException,
      );

      expect(store.callsOf('updateContent')).toHaveLength(0);
    });
  });
});
