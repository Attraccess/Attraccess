import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EmailTemplate, EmailTemplateType } from '@attraccess/database-entities';
import { EntityManager, Repository } from 'typeorm';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { MjmlService } from './mjml.service';

const DEFAULT_LOCALE = 'en';

@Injectable()
export class EmailTemplateService {
  constructor(
    @InjectRepository(EmailTemplate)
    private readonly emailTemplateRepository: Repository<EmailTemplate>,
    private readonly mjmlService: MjmlService,
  ) {}

  async findAll(): Promise<EmailTemplate[]> {
    return this.emailTemplateRepository.find();
  }

  async findOne(type: EmailTemplateType, locale = DEFAULT_LOCALE, manager?: EntityManager): Promise<EmailTemplate> {
    const repo = manager ? manager.getRepository(EmailTemplate) : this.emailTemplateRepository;

    // Try the requested locale first, then fall back to English.
    const template =
      (await repo.findOneBy({ type, locale })) ??
      (locale !== DEFAULT_LOCALE ? await repo.findOneBy({ type, locale: DEFAULT_LOCALE }) : null);

    if (!template) {
      throw new NotFoundException(`Email template "${type}" not found`);
    }

    return template;
  }

  async update(
    type: EmailTemplateType,
    updateEmailTemplateDto: UpdateEmailTemplateDto,
    locale = DEFAULT_LOCALE,
  ): Promise<EmailTemplate> {
    await this.findOne(type, locale);

    if (updateEmailTemplateDto.body) {
      await this.mjmlService.validateAndConvert(updateEmailTemplateDto.body);
    }

    await this.emailTemplateRepository.update(
      { type, locale },
      {
        body: updateEmailTemplateDto.body,
        subject: updateEmailTemplateDto.subject,
      },
    );

    return this.findOne(type, locale);
  }
}
