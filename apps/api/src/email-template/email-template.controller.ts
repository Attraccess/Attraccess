import { Controller, Get, Post, Body, Patch, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { SystemPermission, EmailTemplate, EmailTemplateType } from '@attraccess/database-entities';
import { EmailTemplateService } from './email-template.service';
import { MjmlService } from './mjml.service';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { PreviewMjmlDto, PreviewMjmlResponseDto } from './dto/preview-mjml.dto';

@ApiTags('Email Templates')
@ApiBearerAuth()
@Controller('email-templates')
export class EmailTemplateController {
  constructor(
    private readonly emailTemplateService: EmailTemplateService,
    private readonly mjmlService: MjmlService,
  ) {}

  @Post('preview-mjml')
  @Auth('canManageSystemConfiguration' as SystemPermission)
  @ApiOperation({ summary: 'Preview MJML content as HTML' })
  @ApiBody({ type: PreviewMjmlDto })
  @ApiResponse({ status: 200, description: 'MJML preview result', type: PreviewMjmlResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid MJML content' })
  previewMjml(@Body() previewMjmlDto: PreviewMjmlDto): PreviewMjmlResponseDto {
    return this.mjmlService.convertToHtml(previewMjmlDto.mjmlContent);
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
  @ApiParam({ name: 'type', enum: EmailTemplateType, enumName: 'EmailTemplateType', description: 'Template type/type' })
  @ApiResponse({ status: 200, description: 'Email template found', type: EmailTemplate })
  @ApiResponse({ status: 404, description: 'Template not found' })
  findOne(@Param('type') type: EmailTemplateType): Promise<EmailTemplate> {
    return this.emailTemplateService.findOne(type);
  }

  @Patch(':type')
  @Auth('canManageSystemConfiguration' as SystemPermission)
  @ApiOperation({ summary: 'Update an email template' })
  @ApiParam({ name: 'type', enum: EmailTemplateType, enumName: 'EmailTemplateType', description: 'Template type/type' })
  @ApiResponse({ status: 200, description: 'Template updated successfully', type: EmailTemplate })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  update(
    @Param('type') type: EmailTemplateType,
    @Body() updateEmailTemplateDto: UpdateEmailTemplateDto,
  ): Promise<EmailTemplate> {
    return this.emailTemplateService.update(type, updateEmailTemplateDto);
  }
}
