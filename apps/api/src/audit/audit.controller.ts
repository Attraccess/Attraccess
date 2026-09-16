import { BadRequestException, Controller, Get, Query, ValidationPipe } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { ApiExtraModels, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './audit-query.dto';
import { AuditMetaDto, AuditPageDto } from './audit-response.dto';

@ApiTags('Audit')
@ApiExtraModels(AuditQueryDto)
@Controller('admin/audit-log')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('meta')
  @Auth('system.audit.read')
  @ApiOkResponse({ type: AuditMetaDto })
  meta(): AuditMetaDto {
    return this.audit.meta();
  }

  @Get()
  @Auth('system.audit.read')
  @ApiQuery({ type: AuditQueryDto })
  @ApiOkResponse({ type: AuditPageDto })
  async list(@Query() input: unknown): Promise<AuditPageDto> {
    // The unknown parameter bypasses global DTO stripping; reject unknown filters here.
    const query = await new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }).transform(
      input,
      { type: 'query', metatype: AuditQueryDto },
    );
    if (query.from && query.to && new Date(query.from) > new Date(query.to))
      throw new BadRequestException('Invalid audit time range');
    return this.audit.list(query);
  }
}
