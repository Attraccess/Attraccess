import { Controller, Delete, Get, HttpCode, HttpStatus, Post, Body, Patch, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { SystemPermission, EmailTemplate, EmailTemplateType } from '@attraccess/database-entities';
import { EmailTemplateService, TemplateTranslations } from './email-template.service';
import { MjmlService } from './mjml.service';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { PreviewMjmlDto, PreviewMjmlResponseDto } from './dto/preview-mjml.dto';
import { UpsertTranslationsDto } from './dto/upsert-translations.dto';
import { GetTranslationsResponseDto } from './dto/get-translations-response.dto';
import { EmailLayoutService } from '../email-layout/email-layout.service';

@ApiTags('Email Templates')
@ApiBearerAuth()
@Controller('email-templates')
export class EmailTemplateController {
  constructor(
    private readonly emailTemplateService: EmailTemplateService,
    private readonly mjmlService: MjmlService,
    private readonly emailLayoutService: EmailLayoutService,
  ) {}

  @Post('preview-mjml')
  @Auth('canManageSystemConfiguration' as SystemPermission)
  @ApiOperation({ summary: 'Preview MJML template content as HTML, wrapped in the global email layout' })
  @ApiBody({ type: PreviewMjmlDto })
  @ApiResponse({ status: 200, description: 'MJML preview result', type: PreviewMjmlResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid MJML content' })
  async previewMjml(@Body() previewMjmlDto: PreviewMjmlDto): Promise<PreviewMjmlResponseDto> {
    const isFullMjmlDocument = /^\s*<mjml[\s>]/i.test(previewMjmlDto.mjmlContent);
    if (isFullMjmlDocument) {
      return this.mjmlService.convertToHtml(previewMjmlDto.mjmlContent);
    }
    const layout = await this.emailLayoutService.findGlobal();
    const fullMjml = this.emailLayoutService.injectContentIntoLayout(layout.body, previewMjmlDto.mjmlContent);
    return this.mjmlService.convertToHtml(fullMjml);
  }

  @Get()
  @Auth('canManageSystemConfiguration' as SystemPermission)
  @ApiOperation({ summary: 'List all email templates' })
  @ApiResponse({ status: 200, description: 'List of email templates', type: [EmailTemplate] })
  findAll(): Promise<EmailTemplate[]> {
    return this.emailTemplateService.findAll();
  }

  @Get(':type')
  @Auth('canManageSystemConfiguration' as SystemPermission)
  @ApiOperation({ summary: 'Get an email template by type' })
  @ApiParam({ name: 'type', enum: EmailTemplateType, enumName: 'EmailTemplateType' })
  @ApiResponse({ status: 200, type: EmailTemplate })
  @ApiResponse({ status: 404, description: 'Template not found' })
  findOne(@Param('type') type: EmailTemplateType): Promise<EmailTemplate> {
    return this.emailTemplateService.findOne(type);
  }

  @Patch(':type')
  @Auth('canManageSystemConfiguration' as SystemPermission)
  @ApiOperation({ summary: 'Update an email template' })
  @ApiParam({ name: 'type', enum: EmailTemplateType, enumName: 'EmailTemplateType' })
  @ApiResponse({ status: 200, type: EmailTemplate })
  update(
    @Param('type') type: EmailTemplateType,
    @Body() updateEmailTemplateDto: UpdateEmailTemplateDto,
  ): Promise<EmailTemplate> {
    return this.emailTemplateService.update(type, updateEmailTemplateDto);
  }

  @Post(':type/reset')
  @HttpCode(HttpStatus.OK)
  @Auth('canManageSystemConfiguration' as SystemPermission)
  @ApiOperation({ summary: 'Reset an email template to its bundled default' })
  @ApiParam({ name: 'type', enum: EmailTemplateType, enumName: 'EmailTemplateType', description: 'Template type' })
  @ApiResponse({ status: 200, description: 'Template reset to default', type: EmailTemplate })
  @ApiResponse({ status: 404, description: 'Template not found' })
  resetToDefault(@Param('type') type: EmailTemplateType): Promise<EmailTemplate> {
    return this.emailTemplateService.resetToDefault(type);
  }

  @Get(':type/translations')
  @Auth('canManageSystemConfiguration' as SystemPermission)
  @ApiOperation({
    summary: 'Get all translations for a template — returns extracted keys with defaults and all stored locale values',
  })
  @ApiParam({ name: 'type', enum: EmailTemplateType, enumName: 'EmailTemplateType' })
  @ApiResponse({ status: 200, type: GetTranslationsResponseDto })
  getTranslations(@Param('type') type: EmailTemplateType): Promise<TemplateTranslations> {
    return this.emailTemplateService.getTranslations(type);
  }

  @Post(':type/translations')
  @Auth('canManageSystemConfiguration' as SystemPermission)
  @ApiOperation({ summary: 'Set translations for a locale (replaces all existing values for that locale)' })
  @ApiParam({ name: 'type', enum: EmailTemplateType, enumName: 'EmailTemplateType' })
  @ApiResponse({ status: 201, description: 'Translations saved' })
  async setTranslations(
    @Param('type') type: EmailTemplateType,
    @Body() dto: UpsertTranslationsDto,
  ): Promise<void> {
    await this.emailTemplateService.setTranslations(type, dto.locale, dto.translations);
  }

  @Delete(':type/translations/:locale')
  @Auth('canManageSystemConfiguration' as SystemPermission)
  @ApiOperation({ summary: 'Delete all translations for a locale' })
  @ApiParam({ name: 'type', enum: EmailTemplateType, enumName: 'EmailTemplateType' })
  @ApiParam({ name: 'locale', description: 'BCP 47 locale tag' })
  @ApiResponse({ status: 200, description: 'Translations deleted' })
  deleteTranslations(
    @Param('type') type: EmailTemplateType,
    @Param('locale') locale: string,
  ): Promise<void> {
    return this.emailTemplateService.deleteTranslations(type, locale);
  }
}
