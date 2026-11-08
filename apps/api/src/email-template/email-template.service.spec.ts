import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailTemplateService } from './email-template.service';
import { EmailTemplateType, EmailTemplateTranslation } from '@attraccess/database-entities';
import { MjmlService } from './mjml.service';
import { readDefaultTemplateBody } from './email-defaults';

jest.mock('./email-defaults', () => ({
  EMAIL_TEMPLATE_DEFAULTS: { 'verify-email': { subject: 'Default subject', variables: [] } },
  readDefaultTemplateBody: jest.fn(() => '<mjml></mjml>'),
  SHIPPED_TRANSLATIONS: [{ templateType: 'verify-email', locale: 'de', key: 'greeting', value: 'Hallo {name},' }],
}));

const makeRepo = () => ({
  find: jest.fn(),
  findOneBy: jest.fn(),
  findBy: jest.fn(),
  update: jest.fn(),
  create: jest.fn().mockImplementation((e) => e),
  delete: jest.fn(),
  insert: jest.fn(),
  manager: {
    transaction: jest.fn(),
  },
});

const setup = () => {
  const emailTemplateRepo = makeRepo();
  const translationRepo = makeRepo();
  const mjmlService = { validateAndConvert: jest.fn() } as unknown as MjmlService;

  const service = new EmailTemplateService(emailTemplateRepo as never, translationRepo as never, mjmlService);

  return { service, emailTemplateRepo, translationRepo, mjmlService };
};

describe('EmailTemplateService — translation CRUD', () => {
  describe('getTranslationsMap', () => {
    it('returns key→value map for exact locale match', async () => {
      const { service, translationRepo } = setup();
      translationRepo.findBy.mockResolvedValue([
        { key: 'greeting', value: 'Hallo', locale: 'de', templateType: EmailTemplateType.VERIFY_EMAIL },
      ]);

      const result = await service.getTranslationsMap(EmailTemplateType.VERIFY_EMAIL, 'de');

      expect(result).toEqual({ greeting: 'Hallo' });
      expect(translationRepo.findBy).toHaveBeenCalledWith({
        templateType: EmailTemplateType.VERIFY_EMAIL,
        locale: 'de',
      });
    });

    it('merges base translations with regional overrides per key', async () => {
      const { service, translationRepo } = setup();
      // Promise.all order: [findBy(base), findBy(regional)] → first mock = base, second = regional
      translationRepo.findBy
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
      const { service, translationRepo } = setup();
      translationRepo.findBy
        .mockResolvedValueOnce([
          { key: 'greeting', value: 'Hallo', locale: 'de', templateType: EmailTemplateType.VERIFY_EMAIL },
        ]) // base rows (de)
        .mockResolvedValueOnce([]); // regional rows (de-CH): none

      const result = await service.getTranslationsMap(EmailTemplateType.VERIFY_EMAIL, 'de-CH');

      expect(result).toEqual({ greeting: 'Hallo' });
    });

    it('returns empty map when no translations found', async () => {
      const { service, translationRepo } = setup();
      translationRepo.findBy.mockResolvedValue([]);

      const result = await service.getTranslationsMap(EmailTemplateType.VERIFY_EMAIL, 'fr');

      expect(result).toEqual({});
    });
  });

  describe('setTranslations', () => {
    it('throws NotFoundException for unknown template type', async () => {
      const { service, emailTemplateRepo } = setup();
      emailTemplateRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.setTranslations('nonexistent' as EmailTemplateType, 'de', { greeting: 'Hallo' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('runs delete then insert in a transaction', async () => {
      const { service, emailTemplateRepo, translationRepo } = setup();
      emailTemplateRepo.findOneBy.mockResolvedValue({ type: EmailTemplateType.VERIFY_EMAIL });
      translationRepo.create.mockImplementation((e) => e);

      let capturedFn: ((m: typeof manager) => Promise<void>) | undefined;
      const manager = { delete: jest.fn(), insert: jest.fn() };
      translationRepo.manager.transaction.mockImplementation(async (fn: (m: typeof manager) => Promise<void>) => {
        capturedFn = fn;
        await fn(manager);
      });

      await service.setTranslations(EmailTemplateType.VERIFY_EMAIL, 'de', { greeting: 'Hallo' });

      expect(translationRepo.manager.transaction).toHaveBeenCalled();
      expect(capturedFn).toBeDefined();
      expect(manager.delete).toHaveBeenCalledWith(EmailTemplateTranslation, {
        templateType: EmailTemplateType.VERIFY_EMAIL,
        locale: 'de',
      });
      expect(manager.insert).toHaveBeenCalled();
    });

    it('skips insert when data is empty', async () => {
      const { service, emailTemplateRepo, translationRepo } = setup();
      emailTemplateRepo.findOneBy.mockResolvedValue({ type: EmailTemplateType.VERIFY_EMAIL });
      const manager = { delete: jest.fn(), insert: jest.fn() };
      translationRepo.manager.transaction.mockImplementation(async (fn: (m: typeof manager) => Promise<void>) =>
        fn(manager),
      );

      await service.setTranslations(EmailTemplateType.VERIFY_EMAIL, 'de', {});

      expect(manager.delete).toHaveBeenCalled();
      expect(manager.insert).not.toHaveBeenCalled();
    });
  });

  describe('resetToDefault', () => {
    it('deletes and re-seeds shipped translations inside a transaction', async () => {
      const { service, emailTemplateRepo, translationRepo } = setup();
      emailTemplateRepo.findOneBy.mockResolvedValue({ type: EmailTemplateType.VERIFY_EMAIL });
      emailTemplateRepo.update.mockResolvedValue({});
      const manager = { delete: jest.fn(), insert: jest.fn(), create: jest.fn().mockImplementation((_, e) => e) };
      translationRepo.manager.transaction.mockImplementation(async (fn: (m: typeof manager) => Promise<void>) =>
        fn(manager),
      );

      (readDefaultTemplateBody as jest.Mock).mockClear();
      await service.resetToDefault(EmailTemplateType.VERIFY_EMAIL);

      expect(readDefaultTemplateBody).toHaveBeenCalledWith('verify-email');
      expect(emailTemplateRepo.update).toHaveBeenCalledWith(
        { type: EmailTemplateType.VERIFY_EMAIL },
        expect.objectContaining({ body: '<mjml></mjml>', subject: expect.any(String) }),
      );
      expect(translationRepo.manager.transaction).toHaveBeenCalled();
      expect(manager.delete).toHaveBeenCalledWith(EmailTemplateTranslation, {
        templateType: EmailTemplateType.VERIFY_EMAIL,
      });
      expect(manager.insert).toHaveBeenCalledWith(EmailTemplateTranslation, [
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
      const { service, emailTemplateRepo } = setup();
      // Even a stored row (the path parameter is user input) must not make the key a file name.
      emailTemplateRepo.findOneBy.mockResolvedValue({ type: key });
      (readDefaultTemplateBody as jest.Mock).mockClear();

      await expect(service.resetToDefault(key as never)).rejects.toBeInstanceOf(NotFoundException);

      expect(readDefaultTemplateBody).not.toHaveBeenCalled();
      expect(emailTemplateRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteTranslations', () => {
    it('throws NotFoundException for unknown template type', async () => {
      const { service, emailTemplateRepo } = setup();
      emailTemplateRepo.findOneBy.mockResolvedValue(null);

      await expect(service.deleteTranslations('nonexistent' as EmailTemplateType, 'de')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes translations for the given type and locale', async () => {
      const { service, emailTemplateRepo, translationRepo } = setup();
      emailTemplateRepo.findOneBy.mockResolvedValue({ type: EmailTemplateType.VERIFY_EMAIL });
      translationRepo.delete.mockResolvedValue({ affected: 3 });

      await service.deleteTranslations(EmailTemplateType.VERIFY_EMAIL, 'de');

      expect(translationRepo.delete).toHaveBeenCalledWith({
        templateType: EmailTemplateType.VERIFY_EMAIL,
        locale: 'de',
      });
    });
  });

  describe('update', () => {
    const FRAGMENT = '<mj-section><mj-column><mj-text>Hi</mj-text></mj-column></mj-section>';

    it('validates fragment bodies wrapped in an <mjml><mj-body> shell', async () => {
      const { service, emailTemplateRepo, mjmlService } = setup();
      emailTemplateRepo.findOneBy.mockResolvedValue({ type: EmailTemplateType.VERIFY_EMAIL });
      emailTemplateRepo.update.mockResolvedValue({});

      await service.update(EmailTemplateType.VERIFY_EMAIL, { subject: 'S', body: FRAGMENT });

      expect(mjmlService.validateAndConvert).toHaveBeenCalledWith(`<mjml><mj-body>${FRAGMENT}</mj-body></mjml>`);
      expect(emailTemplateRepo.update).toHaveBeenCalledWith(
        { type: EmailTemplateType.VERIFY_EMAIL },
        { subject: 'S', body: FRAGMENT },
      );
    });

    it.each([
      ['an empty subject', { subject: ' ', body: FRAGMENT }],
      ['an empty body', { subject: 'S', body: '' }],
      ['a body without MJML elements', { subject: 'S', body: 'just text' }],
      ['a subject with an unclosed block', { subject: '{{#if a}}broken', body: FRAGMENT }],
      ['a body calling an unknown helper', { subject: 'S', body: FRAGMENT.replace('Hi', '{{shout "x"}}') }],
    ])('rejects %s before anything is stored', async (_name, edit) => {
      const { service, emailTemplateRepo } = setup();
      emailTemplateRepo.findOneBy.mockResolvedValue({ type: EmailTemplateType.VERIFY_EMAIL });

      await expect(service.update(EmailTemplateType.VERIFY_EMAIL, edit)).rejects.toThrow(BadRequestException);
      expect(emailTemplateRepo.update).not.toHaveBeenCalled();
    });

    it('accepts the t helper and block helpers in subject and body', async () => {
      const { service, emailTemplateRepo } = setup();
      emailTemplateRepo.findOneBy.mockResolvedValue({ type: EmailTemplateType.VERIFY_EMAIL });
      emailTemplateRepo.update.mockResolvedValue({});

      await expect(
        service.update(EmailTemplateType.VERIFY_EMAIL, {
          subject: '{{#if a}}{{t "s" "Hi {x}" x=a}}{{else}}no{{/if}}',
          body: '<mj-raw>{{#if a}}</mj-raw><mj-section><mj-column><mj-text>{{t "k" "Hi"}}</mj-text></mj-column></mj-section><mj-raw>{{/if}}</mj-raw>',
        }),
      ).resolves.toBeDefined();
    });

    it('rejects full <mjml> documents — the send pipeline expects fragments', async () => {
      const { service, emailTemplateRepo, mjmlService } = setup();
      emailTemplateRepo.findOneBy.mockResolvedValue({ type: EmailTemplateType.VERIFY_EMAIL });

      await expect(
        service.update(EmailTemplateType.VERIFY_EMAIL, {
          subject: 'S',
          body: `<mjml><mj-body>${FRAGMENT}</mj-body></mjml>`,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mjmlService.validateAndConvert).not.toHaveBeenCalled();
      expect(emailTemplateRepo.update).not.toHaveBeenCalled();
    });

    it('propagates MJML validation failures without persisting', async () => {
      const { service, emailTemplateRepo, mjmlService } = setup();
      emailTemplateRepo.findOneBy.mockResolvedValue({ type: EmailTemplateType.VERIFY_EMAIL });
      (mjmlService.validateAndConvert as jest.Mock).mockRejectedValue(new BadRequestException('bad mjml'));

      await expect(
        service.update(EmailTemplateType.VERIFY_EMAIL, { subject: 'S', body: '<mj-bogus>' }),
      ).rejects.toThrow(BadRequestException);

      expect(emailTemplateRepo.update).not.toHaveBeenCalled();
    });
  });
});
