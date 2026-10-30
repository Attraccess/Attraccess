import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResourceIntroducersService } from './resourceIntroducers.service';
import { ResourceIntroducer, ResourceIntroducerType } from '@attraccess/database-entities';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { IsResourceIntroducerResponseDto } from './dtos/isIntroducer.response.dto';
import { GrantIntroducerDto } from './dtos/grantIntroducer.dto';
import { ResourceIntroducerNameDto } from './dtos/introducerName.dto';

@ApiTags('Access Control')
@Controller('resources/:resourceId/introducers')
export class ResourceIntroducersController {
  constructor(private readonly resourceIntroducersService: ResourceIntroducersService) {}

  @Get('/:userId/is-introducer')
  @Auth()
  @ApiOperation({
    summary: 'Check if a user is an introducer for a resource',
    operationId: 'resourceIntroducersIsIntroducer',
  })
  @ApiResponse({
    status: 200,
    description: 'User is an introducer for the resource',
    type: IsResourceIntroducerResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Only managers may ask about other users' })
  async isIntroducer(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('includeGroups') includeGroups: boolean,
    @Req() req: AuthenticatedRequest,
  ): Promise<IsResourceIntroducerResponseDto> {
    const permissions = req.user.effectivePermissions;
    if (
      userId !== req.user.id &&
      !permissions?.has('resources.update') &&
      !permissions?.has('resources.access.manage')
    ) {
      throw new ForbiddenException('You can only check your own introducer status');
    }
    const isResourceIntroducer = await this.resourceIntroducersService.isIntroducer(resourceId, userId, includeGroups);

    return {
      isIntroducer: isResourceIntroducer,
    };
  }

  @Get('/names')
  @Auth('resources.read')
  @ApiOperation({
    summary: 'List who can introduce users to a resource (names only)',
    operationId: 'resourceIntroducersGetNames',
  })
  @ApiResponse({
    status: 200,
    description: 'Direct and group introducers and maintainers, without contact details',
    type: [ResourceIntroducerNameDto],
  })
  async getNames(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<ResourceIntroducerNameDto[]> {
    return await this.resourceIntroducersService.getNames(resourceId);
  }

  @Get()
  @Auth()
  @ApiOperation({ summary: 'Get all introducers for a resource', operationId: 'resourceIntroducersGetMany' })
  @ApiResponse({
    status: 200,
    description: 'All introducers for a resource',
    type: [ResourceIntroducer],
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ResourceIntroducerType,
    enumName: 'ResourceIntroducerType',
    description: 'Filter by access type. Omit to return both introducers and maintainers.',
  })
  @ApiResponse({ status: 403, description: 'Only managers and introducers may read the full list' })
  async getMany(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: ResourceIntroducerType,
  ): Promise<ResourceIntroducer[]> {
    if (!(await this.resourceIntroducersService.canViewAccessLists(resourceId, req.user))) {
      throw new ForbiddenException('User cannot view the introducers of this resource');
    }
    return await this.resourceIntroducersService.getMany(resourceId, type);
  }

  @Post('/:userId/grant')
  @ApiOperation({
    summary: 'Grant a user introduction permission for a resource',
    operationId: 'resourceIntroducersGrant',
  })
  @ApiResponse({
    status: 200,
    description: 'Introduction permissions granted',
    type: ResourceIntroducer,
  })
  @Auth('resources.access.manage')
  async grant(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body?: GrantIntroducerDto,
  ): Promise<ResourceIntroducer> {
    return await this.resourceIntroducersService.grant(resourceId, userId, body?.type);
  }

  @Delete('/:userId/revoke')
  @ApiOperation({
    summary: 'Revoke a user introduction permission for a resource',
    operationId: 'resourceIntroducersRevoke',
  })
  @ApiResponse({
    status: 200,
    description: 'Introduction permissions revoked',
  })
  @Auth('resources.access.manage')
  async revoke(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body?: GrantIntroducerDto,
  ): Promise<{ OK: true }> {
    await this.resourceIntroducersService.revoke(resourceId, userId, body?.type);

    return {
      OK: true,
    };
  }
}
