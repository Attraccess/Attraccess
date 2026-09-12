import { BadRequestException, Controller, Get, Query, ValidationPipe } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './audit-query.dto';

@ApiTags('Audit')
@Controller('admin/audit-log')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Auth('system.audit.read')
  @ApiQuery({ type: AuditQueryDto })
  async list(@Query() input: unknown) {
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
