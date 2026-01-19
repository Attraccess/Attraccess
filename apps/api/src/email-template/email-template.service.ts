import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EmailTemplate, EmailTemplateType } from '@attraccess/database-entities';
import { EntityManager, Repository } from 'typeorm';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { MjmlService } from './mjml.service';

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

  async findOne(type: EmailTemplateType, manager?: EntityManager): Promise<EmailTemplate> {
    const templateRepo = manager ? manager.getRepository(EmailTemplate) : this.emailTemplateRepository;
    const template = await templateRepo.findOneBy({ type });

    if (!template) {
      throw new NotFoundException(`Email template "${type}" not found`);
    }

    return template;
  }

  async update(type: EmailTemplateType, updateEmailTemplateDto: UpdateEmailTemplateDto): Promise<EmailTemplate> {
    await this.findOne(type);

    if (updateEmailTemplateDto.body) {
      this.mjmlService.validateAndConvert(updateEmailTemplateDto.body);
    }

    await this.emailTemplateRepository.update(
      { type },
      {
        body: updateEmailTemplateDto.body,
        subject: updateEmailTemplateDto.subject,
      },
    );

    return this.findOne(type);
  }
}
