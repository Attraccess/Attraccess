import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ResourceIntroducerType } from '@attraccess/database-entities';
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResourceIntroducersService } from './resourceIntroducers.service';
import { ResourceUsageService } from '../usage/sessions/resource-usage.service';
import { IntroducerDirectoryEntryDto } from './dtos/introducer-directory.response.dto';

@ApiTags('Access Control')
@Controller('resources/:resourceId/introducer-directory')
@Auth()
export class ResourceIntroducerDirectoryController {
  constructor(
    private readonly introducers: ResourceIntroducersService,
    private readonly usage: ResourceUsageService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get names for equipment help or supervision', operationId: 'resourceIntroducerDirectory' })
  @ApiQuery({ name: 'purpose', enum: ['help', 'supervision'], required: false })
  @ApiQuery({ name: 'type', enum: ResourceIntroducerType, required: false })
  @ApiResponse({ status: 200, type: [IntroducerDirectoryEntryDto] })
  async getMany(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() req: AuthenticatedRequest,
    @Query('purpose') purpose: 'help' | 'supervision' = 'help',
    @Query('type') type?: ResourceIntroducerType,
  ): Promise<IntroducerDirectoryEntryDto[]> {
    if (!['help', 'supervision'].includes(purpose) || (type && !Object.values(ResourceIntroducerType).includes(type))) {
      throw new BadRequestException('Invalid directory request');
    }
    if (
      !req.user.effectivePermissions?.has('resources.read') &&
      !req.user.effectivePermissions?.has('resources.update')
    ) {
      throw new ForbiddenException('Resource read permission required');
    }
    if (purpose === 'supervision') {
      await this.usage.assertSupportsSupervision(resourceId);
      type = ResourceIntroducerType.INTRODUCER;
    }
    const entries = await this.introducers.getMany(resourceId, type);
    const users = new Map<number, IntroducerDirectoryEntryDto>();
    for (const entry of entries) {
      if (!entry.user || (purpose === 'supervision' && entry.userId === req.user.id)) continue;
      users.set(entry.userId, { id: entry.userId, username: entry.user.username });
    }
    return [...users.values()];
  }
}
