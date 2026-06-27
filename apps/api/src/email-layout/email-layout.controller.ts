import { Controller, Get, Body, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { SystemPermission } from '@attraccess/database-entities';
import { EmailLayoutService } from './email-layout.service';
import { UpdateEmailLayoutDto } from './dto/update-email-layout.dto';
import { PreviewEmailLayoutDto } from './dto/preview-email-layout.dto';
import { PreviewMjmlResponseDto } from '../email-template/dto/preview-mjml.dto';
import { EmailLayoutResponseDto } from './dto/email-layout-response.dto';

@ApiTags('Email Layout')
@ApiBearerAuth()
@Controller('email-layout')
export class EmailLayoutController {
  constructor(private readonly emailLayoutService: EmailLayoutService) {}

  @Get()
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Get the global email layout' })
  @ApiResponse({ status: 200, type: EmailLayoutResponseDto })
  findGlobal(): Promise<EmailLayoutResponseDto> {
    return this.emailLayoutService.findGlobal();
  }

  @Patch()
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Update the global email layout' })
  @ApiResponse({ status: 200, type: EmailLayoutResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid MJML content' })
  update(@Body() dto: UpdateEmailLayoutDto): Promise<EmailLayoutResponseDto> {
    return this.emailLayoutService.update(dto);
  }

  @Post('preview')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Preview the global email layout with sample content injected' })
  @ApiResponse({ status: 200, type: PreviewMjmlResponseDto })
  previewLayout(@Body() dto: PreviewEmailLayoutDto): Promise<PreviewMjmlResponseDto> {
    return this.emailLayoutService.previewLayout(dto.body);
  }
}
