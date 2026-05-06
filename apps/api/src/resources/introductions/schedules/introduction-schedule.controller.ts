// HTTP controller for resource-scope introduction schedules
// FEATURE: User retraining requirement (ATT-106)
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { ResourceIntroductionSchedule } from '@attraccess/database-entities';
import { IntroductionScheduleService } from './introduction-schedule.service';
import { CreateIntroductionScheduleDto } from './dtos/create-introduction-schedule.dto';
import { UpdateIntroductionScheduleDto } from './dtos/update-introduction-schedule.dto';

@ApiTags('Resource Introduction Schedules')
@Controller('resources/:resourceId/introduction-schedules')
@Auth()
export class IntroductionScheduleController {
  constructor(private readonly svc: IntroductionScheduleService) {}

  @Get()
  @ApiOperation({
    summary: 'List introduction schedules for resource',
    operationId: 'findIntroductionSchedules',
  })
  @ApiParam({ name: 'resourceId', type: Number })
  @ApiResponse({ status: 200, type: [ResourceIntroductionSchedule] })
  list(@Param('resourceId', ParseIntPipe) resourceId: number) {
    return this.svc.findAll({ resourceId });
  }

  @Get(':scheduleId')
  @ApiOperation({ summary: 'Get one schedule', operationId: 'getIntroductionSchedule' })
  @ApiParam({ name: 'resourceId', type: Number })
  @ApiParam({ name: 'scheduleId', type: Number })
  @ApiResponse({ status: 200, type: ResourceIntroductionSchedule })
  getOne(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('scheduleId', ParseIntPipe) scheduleId: number
  ) {
    return this.svc.getOne({ resourceId }, scheduleId);
  }

  @Post()
  @Auth('canManageResources')
  @ApiOperation({ summary: 'Create schedule', operationId: 'createIntroductionSchedule' })
  @ApiParam({ name: 'resourceId', type: Number })
  @ApiResponse({ status: 201, type: ResourceIntroductionSchedule })
  create(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() dto: CreateIntroductionScheduleDto
  ) {
    return this.svc.create({ resourceId }, dto);
  }

  @Patch(':scheduleId')
  @Auth('canManageResources')
  @ApiOperation({ summary: 'Update schedule', operationId: 'updateIntroductionSchedule' })
  @ApiParam({ name: 'resourceId', type: Number })
  @ApiParam({ name: 'scheduleId', type: Number })
  @ApiResponse({ status: 200, type: ResourceIntroductionSchedule })
  update(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
    @Body() dto: UpdateIntroductionScheduleDto
  ) {
    return this.svc.update({ resourceId }, scheduleId, dto);
  }

  @Delete(':scheduleId')
  @Auth('canManageResources')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete schedule', operationId: 'deleteIntroductionSchedule' })
  @ApiParam({ name: 'resourceId', type: Number })
  @ApiParam({ name: 'scheduleId', type: Number })
  @ApiResponse({ status: 204 })
  async remove(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('scheduleId', ParseIntPipe) scheduleId: number
  ) {
    await this.svc.delete({ resourceId }, scheduleId);
  }
}
