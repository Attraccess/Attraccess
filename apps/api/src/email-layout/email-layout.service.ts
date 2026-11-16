import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AUDIT_RECORDER, AuditActor, AuditRecorder } from '../audit/recorder/audit-event';
import { EmailTemplate } from '@attraccess/database-entities';
import { UpdateEmailLayoutDto } from './dto/update-email-layout.dto';
import { EmailLayoutResponseDto } from './dto/email-layout-response.dto';
import { SettingsStoreService } from '../settings/settings-store.service';
import { MjmlService } from '../email-template/mjml.service';
import { PreviewMjmlResponseDto } from '../email-template/dto/preview-mjml.dto';
import { PREVIEW_SAMPLE_CONTENT } from './dto/preview-email-layout.dto';
import { readDefaultLayoutBody } from '../email-template/email-defaults';

const EMAIL_LAYOUT_PARENT = 'email_layout';
const EMAIL_LAYOUT_KEY = 'body';
const CONTENT_PLACEHOLDER = '{{content}}';

@Injectable()
export class EmailLayoutService {
  constructor(
    private readonly settingsStore: SettingsStoreService,
    private readonly mjmlService: MjmlService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  injectContentIntoLayout(layoutMjml: string, contentMjml: string): string {
    if (!layoutMjml.includes(CONTENT_PLACEHOLDER)) {
      throw new BadRequestException(`Email layout is missing the required placeholder: ${CONTENT_PLACEHOLDER}`);
    }
    return layoutMjml.split(CONTENT_PLACEHOLDER).join(contentMjml);
  }

  async findGlobal(): Promise<EmailLayoutResponseDto> {
    const body = await this.settingsStore.getPlainSetting(EMAIL_LAYOUT_PARENT, EMAIL_LAYOUT_KEY);
    if (!body) {
      throw new NotFoundException('Global email layout not found');
    }
    return { body };
  }

  async previewLayout(body: string): Promise<PreviewMjmlResponseDto> {
    const fullMjml = this.injectContentIntoLayout(body, PREVIEW_SAMPLE_CONTENT);
    return this.mjmlService.convertToHtml(fullMjml);
  }

  async renderWithTemplate(template: Pick<EmailTemplate, 'body'>): Promise<string> {
    const layout = await this.findGlobal();
    const fullMjml = this.injectContentIntoLayout(layout.body, template.body);
    return this.mjmlService.validateAndConvert(fullMjml);
  }

  async update(dto: UpdateEmailLayoutDto, actor: AuditActor): Promise<EmailLayoutResponseDto> {
    if (!dto.body.includes(CONTENT_PLACEHOLDER)) {
      throw new BadRequestException(`Email layout body must contain the placeholder '${CONTENT_PLACEHOLDER}'`);
    }
    const testContent = `<mj-section><mj-column><mj-text>test</mj-text></mj-column></mj-section>`;
    const fullMjml = this.injectContentIntoLayout(dto.body, testContent);
    await this.mjmlService.validateAndConvert(fullMjml);

    await this.settingsStore.setPlainSetting(EMAIL_LAYOUT_PARENT, EMAIL_LAYOUT_KEY, dto.body);

    const layout = await this.findGlobal();
    await this.record(actor, 'email_layout.updated');
    return layout;
  }

  async resetToDefault(actor: AuditActor): Promise<EmailLayoutResponseDto> {
    const defaultBody = readDefaultLayoutBody();
    await this.settingsStore.setPlainSetting(EMAIL_LAYOUT_PARENT, EMAIL_LAYOUT_KEY, defaultBody);
    const layout = await this.findGlobal();
    await this.record(actor, 'email_layout.reset');
    return layout;
  }

  /** The installation has one global layout; its audit subject id is fixed. */
  private async record(actor: AuditActor, action: 'email_layout.updated' | 'email_layout.reset') {
    await this.audit.record({
      domain: 'administration',
      action,
      actor,
      subject: { type: 'email-layout', id: 1 },
      details: {},
    });
  }
}
