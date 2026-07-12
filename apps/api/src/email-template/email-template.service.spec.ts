import { NotFoundException } from '@nestjs/common';
import { EmailTemplateService } from './email-template.service';
import { EmailTemplateType, EmailTemplateTranslation } from '@attraccess/database-entities';
import { MjmlService } from './mjml.service';

const makeRepo = () => ({
  find: jest.fn(),
  findOneBy: jest.fn(),
  findBy: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  manager: {
    transaction: jest.fn(),
  },
});

const setup = () => {
  const emailTemplateRepo = makeRepo();
  const translationRepo = makeRepo();
  const mjmlService = { validateAndConvert: jest.fn() } as unknown as MjmlService;

  const service = new EmailTemplateService(
    emailTemplateRepo as never,
    translationRepo as never,
    mjmlService,
  );

  return { service, emailTemplateRepo, translationRepo };
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
      expect(translationRepo.findBy).toHaveBeenCalledWith({ templateType: EmailTemplateType.VERIFY_EMAIL, locale: 'de' });
    });

    it('falls back to base language when no exact match for regional locale', async () => {
      const { service, translationRepo } = setup();
      translationRepo.findBy
        .mockResolvedValueOnce([]) // de-CH: no match
        .mockResolvedValueOnce([
          { key: 'greeting', value: 'Hallo', locale: 'de', templateType: EmailTemplateType.VERIFY_EMAIL },
        ]); // de: match

      const result = await service.getTranslationsMap(EmailTemplateType.VERIFY_EMAIL, 'de-CH');

      expect(result).toEqual({ greeting: 'Hallo' });
      expect(translationRepo.findBy).toHaveBeenCalledTimes(2);
      expect(translationRepo.findBy).toHaveBeenLastCalledWith({ templateType: EmailTemplateType.VERIFY_EMAIL, locale: 'de' });
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
      translationRepo.manager.transaction.mockImplementation(async (fn: (m: typeof manager) => Promise<void>) => fn(manager));

      await service.setTranslations(EmailTemplateType.VERIFY_EMAIL, 'de', {});

      expect(manager.delete).toHaveBeenCalled();
      expect(manager.insert).not.toHaveBeenCalled();
    });
  });

  describe('deleteTranslations', () => {
    it('throws NotFoundException for unknown template type', async () => {
      const { service, emailTemplateRepo } = setup();
      emailTemplateRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.deleteTranslations('nonexistent' as EmailTemplateType, 'de'),
      ).rejects.toThrow(NotFoundException);
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
});
