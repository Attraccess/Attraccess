import { Controller, Get, Body, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { SystemPermission, EmailLayout } from '@attraccess/database-entities';
import { EmailLayoutService } from './email-layout.service';
import { MjmlService } from '../email-template/mjml.service';
import { UpdateEmailLayoutDto } from './dto/update-email-layout.dto';
import { PreviewEmailLayoutDto, PREVIEW_SAMPLE_CONTENT } from './dto/preview-email-layout.dto';
import { PreviewMjmlResponseDto } from '../email-template/dto/preview-mjml.dto';

@ApiTags('Email Layout')
@ApiBearerAuth()
@Controller('email-layout')
export class EmailLayoutController {
  constructor(
    private readonly emailLayoutService: EmailLayoutService,
    private readonly mjmlService: MjmlService,
  ) {}

  @Get()
  @Auth('canManageSystemConfiguration' as SystemPermission)
  @ApiOperation({ summary: 'Get the global email layout' })
  @ApiResponse({ status: 200, type: EmailLayout })
  findGlobal(): Promise<EmailLayout> {
    return this.emailLayoutService.findGlobal();
  }

  @Patch()
  @Auth('canManageSystemConfiguration' as SystemPermission)
  @ApiOperation({ summary: 'Update the global email layout' })
  @ApiResponse({ status: 200, type: EmailLayout })
  @ApiResponse({ status: 400, description: 'Invalid MJML content' })
  update(@Body() dto: UpdateEmailLayoutDto): Promise<EmailLayout> {
    return this.emailLayoutService.update(dto);
  }

  @Post('preview')
  @Auth('canManageSystemConfiguration' as SystemPermission)
  @ApiOperation({ summary: 'Preview the global email layout with sample content injected' })
  @ApiResponse({ status: 200, type: PreviewMjmlResponseDto })
  async previewLayout(@Body() dto: PreviewEmailLayoutDto): Promise<PreviewMjmlResponseDto> {
    const fullMjml = this.mjmlService.injectContentIntoLayout(dto.body, PREVIEW_SAMPLE_CONTENT);
    return this.mjmlService.convertToHtml(fullMjml);
  }
}
