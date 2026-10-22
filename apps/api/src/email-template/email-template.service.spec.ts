import { EmailTemplatePersistence } from './persistence/port';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailTemplateService } from './email-template.service';
import { EmailTemplateType } from '@attraccess/application-models';
import { MjmlService } from './mjml.service';

jest.mock('./email-defaults', () => ({
  EMAIL_TEMPLATE_DEFAULTS: { 'verify-email': { subject: 'Default subject', variables: [] } },
  readDefaultTemplateBody: jest.fn(() => '<mjml></mjml>'),
  SHIPPED_TRANSLATIONS: [{ templateType: 'verify-email', locale: 'de', key: 'greeting', value: 'Hallo {name},' }],
}));

const setup = () => {
  const persistence: jest.Mocked<EmailTemplatePersistence> = {
    template: jest.fn(),
    templates: jest.fn(),
    update: jest.fn(),
    translations: jest.fn(),
    replaceTranslations: jest.fn(),
    removeTranslations: jest.fn(),
  };
  const mjmlService = { validateAndConvert: jest.fn() } as unknown as MjmlService;
  const service = new EmailTemplateService(persistence, mjmlService);
  return { service, persistence, mjmlService };
};

describe('EmailTemplateService — translation CRUD', () => {
  describe('getTranslationsMap', () => {
    it('returns key→value map for exact locale match', async () => {
      const { service, persistence } = setup();
      persistence.translations.mockResolvedValue([
        { key: 'greeting', value: 'Hallo', locale: 'de', templateType: EmailTemplateType.VERIFY_EMAIL },
      ]);

      const result = await service.getTranslationsMap(EmailTemplateType.VERIFY_EMAIL, 'de');

      expect(result).toEqual({ greeting: 'Hallo' });
      expect(persistence.translations).toHaveBeenCalledWith(EmailTemplateType.VERIFY_EMAIL, 'de');
    });

    it('merges base translations with regional overrides per key', async () => {
      const { service, persistence } = setup();
      // Promise.all order: [findBy(base), findBy(regional)] → first mock = base, second = regional
      persistence.translations
        .mockResolvedValueOnce([
          { key: 'greeting', value: 'Hallo', locale: 'de', templateType: EmailTemplateType.VERIFY_EMAIL },
          {
            key: 'footer',
            value: 'Ignoriere diese E-Mail',
            locale: 'de',
            templateType: EmailTemplateType.VERIFY_EMAIL,
          },
        ]) // base rows (de)
        .mockResolvedValueOnce([
          { key: 'greeting', value: 'Grüezi', locale: 'de-CH', templateType: EmailTemplateType.VERIFY_EMAIL },
          { key: 'footer', value: '', locale: 'de-CH', templateType: EmailTemplateType.VERIFY_EMAIL },
        ]); // regional rows (de-CH)

      const result = await service.getTranslationsMap(EmailTemplateType.VERIFY_EMAIL, 'de-CH');

      // greeting from regional; footer from base (regional empty string skipped)
      expect(result).toEqual({ greeting: 'Grüezi', footer: 'Ignoriere diese E-Mail' });
    });

    it('falls back entirely to base when regional locale has no rows', async () => {
      const { service, persistence } = setup();
      persistence.translations
        .mockResolvedValueOnce([
          { key: 'greeting', value: 'Hallo', locale: 'de', templateType: EmailTemplateType.VERIFY_EMAIL },
        ]) // base rows (de)
        .mockResolvedValueOnce([]); // regional rows (de-CH): none

      const result = await service.getTranslationsMap(EmailTemplateType.VERIFY_EMAIL, 'de-CH');

      expect(result).toEqual({ greeting: 'Hallo' });
    });

    it('returns empty map when no translations found', async () => {
      const { service, persistence } = setup();
      persistence.translations.mockResolvedValue([]);

      const result = await service.getTranslationsMap(EmailTemplateType.VERIFY_EMAIL, 'fr');

      expect(result).toEqual({});
    });
  });

  describe('setTranslations', () => {
    it('throws NotFoundException for unknown template type', async () => {
      const { service, persistence } = setup();
      persistence.template.mockResolvedValue(null);

      await expect(
        service.setTranslations('nonexistent' as EmailTemplateType, 'de', { greeting: 'Hallo' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('replaces one locale in a single persistence operation', async () => {
      const { service, persistence } = setup();
      persistence.template.mockResolvedValue({ type: EmailTemplateType.VERIFY_EMAIL } as never);
      await service.setTranslations(EmailTemplateType.VERIFY_EMAIL, 'de', { greeting: 'Hallo' });
      expect(persistence.replaceTranslations).toHaveBeenCalledWith(
        EmailTemplateType.VERIFY_EMAIL,
        [{ templateType: EmailTemplateType.VERIFY_EMAIL, locale: 'de', key: 'greeting', value: 'Hallo' }],
        'de',
      );
    });
    it('clears a locale when replacement data is empty', async () => {
      const { service, persistence } = setup();
      persistence.template.mockResolvedValue({ type: EmailTemplateType.VERIFY_EMAIL } as never);
      await service.setTranslations(EmailTemplateType.VERIFY_EMAIL, 'de', {});
      expect(persistence.replaceTranslations).toHaveBeenCalledWith(EmailTemplateType.VERIFY_EMAIL, [], 'de');
    });
  });
  describe('resetToDefault', () => {
    it('restores default content and replaces every locale with shipped translations', async () => {
      const { service, persistence } = setup();
      persistence.template.mockResolvedValue({ type: EmailTemplateType.VERIFY_EMAIL } as never);
      await service.resetToDefault(EmailTemplateType.VERIFY_EMAIL);
      expect(persistence.update).toHaveBeenCalledWith(EmailTemplateType.VERIFY_EMAIL, {
        subject: 'Default subject',
        body: '<mjml></mjml>',
        variables: [],
      });
      expect(persistence.replaceTranslations).toHaveBeenCalledWith(EmailTemplateType.VERIFY_EMAIL, [
        { templateType: 'verify-email', locale: 'de', key: 'greeting', value: 'Hallo {name},' },
      ]);
    });
  });

  describe('deleteTranslations', () => {
    it('throws NotFoundException for unknown template type', async () => {
      const { service, persistence } = setup();
      persistence.template.mockResolvedValue(null);

      await expect(service.deleteTranslations('nonexistent' as EmailTemplateType, 'de')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes translations for the given type and locale', async () => {
      const { service, persistence } = setup();
      persistence.template.mockResolvedValue({ type: EmailTemplateType.VERIFY_EMAIL } as never);
      persistence.removeTranslations.mockResolvedValue(undefined);

      await service.deleteTranslations(EmailTemplateType.VERIFY_EMAIL, 'de');

      expect(persistence.removeTranslations).toHaveBeenCalledWith(EmailTemplateType.VERIFY_EMAIL, 'de');
    });
  });

  describe('update', () => {
    const FRAGMENT = '<mj-section><mj-column><mj-text>Hi</mj-text></mj-column></mj-section>';

    it('validates fragment bodies wrapped in an <mjml><mj-body> shell', async () => {
      const { service, persistence, mjmlService } = setup();
      persistence.template.mockResolvedValue({ type: EmailTemplateType.VERIFY_EMAIL } as never);
      persistence.update.mockResolvedValue(undefined);

      await service.update(EmailTemplateType.VERIFY_EMAIL, { subject: 'S', body: FRAGMENT });

      expect(mjmlService.validateAndConvert).toHaveBeenCalledWith(`<mjml><mj-body>${FRAGMENT}</mj-body></mjml>`);
      expect(persistence.update).toHaveBeenCalledWith(EmailTemplateType.VERIFY_EMAIL, { subject: 'S', body: FRAGMENT });
    });

    it('rejects full <mjml> documents — the send pipeline expects fragments', async () => {
      const { service, persistence, mjmlService } = setup();
      persistence.template.mockResolvedValue({ type: EmailTemplateType.VERIFY_EMAIL } as never);

      await expect(
        service.update(EmailTemplateType.VERIFY_EMAIL, {
          subject: 'S',
          body: `<mjml><mj-body>${FRAGMENT}</mj-body></mjml>`,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mjmlService.validateAndConvert).not.toHaveBeenCalled();
      expect(persistence.update).not.toHaveBeenCalled();
    });

    it('propagates MJML validation failures without persisting', async () => {
      const { service, persistence, mjmlService } = setup();
      persistence.template.mockResolvedValue({ type: EmailTemplateType.VERIFY_EMAIL } as never);
      (mjmlService.validateAndConvert as jest.Mock).mockRejectedValue(new BadRequestException('bad mjml'));

      await expect(
        service.update(EmailTemplateType.VERIFY_EMAIL, { subject: 'S', body: '<mj-bogus>' }),
      ).rejects.toThrow(BadRequestException);

      expect(persistence.update).not.toHaveBeenCalled();
    });
  });
});
