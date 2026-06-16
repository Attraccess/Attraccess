import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EmailLayout, EmailTemplate, EMAIL_LAYOUT_SINGLETON_ID } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { UpdateEmailLayoutDto } from './dto/update-email-layout.dto';
import { MjmlService } from '../email-template/mjml.service';

@Injectable()
export class EmailLayoutService {
  constructor(
    @InjectRepository(EmailLayout)
    private readonly emailLayoutRepository: Repository<EmailLayout>,
    private readonly mjmlService: MjmlService,
  ) {}

  async findGlobal(): Promise<EmailLayout> {
    const layout = await this.emailLayoutRepository.findOneBy({ id: EMAIL_LAYOUT_SINGLETON_ID });
    if (!layout) {
      throw new NotFoundException('Global email layout not found');
    }
    return layout;
  }

  async renderWithTemplate(template: Pick<EmailTemplate, 'body'>): Promise<string> {
    const layout = await this.findGlobal();
    const fullMjml = this.mjmlService.injectContentIntoLayout(layout.body, template.body);
    return this.mjmlService.validateAndConvert(fullMjml);
  }

  async update(dto: UpdateEmailLayoutDto): Promise<EmailLayout> {
    if (!dto.body.includes('{{{content}}}')) {
      throw new BadRequestException("Email layout body must contain the placeholder '{{{content}}}'");
    }
    const testContent = `<mj-section><mj-column><mj-text>test</mj-text></mj-column></mj-section>`;
    const fullMjml = this.mjmlService.injectContentIntoLayout(dto.body, testContent);
    await this.mjmlService.validateAndConvert(fullMjml);

    await this.emailLayoutRepository.update({ id: EMAIL_LAYOUT_SINGLETON_ID }, { body: dto.body });

    return this.findGlobal();
  }
}
