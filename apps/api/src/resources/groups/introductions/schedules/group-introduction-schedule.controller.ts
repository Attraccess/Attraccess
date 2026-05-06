// HTTP controller for group-scope introduction schedules
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
import { IntroductionScheduleService } from '../../../introductions/schedules/introduction-schedule.service';
import { CreateIntroductionScheduleDto } from '../../../introductions/schedules/dtos/create-introduction-schedule.dto';
import { UpdateIntroductionScheduleDto } from '../../../introductions/schedules/dtos/update-introduction-schedule.dto';

@ApiTags('Resource Group Introduction Schedules')
@Controller('resource-groups/:groupId/introduction-schedules')
@Auth()
export class GroupIntroductionScheduleController {
  constructor(private readonly svc: IntroductionScheduleService) {}

  @Get()
  @ApiOperation({
    summary: 'List introduction schedules for resource group',
    operationId: 'findGroupIntroductionSchedules',
  })
  @ApiParam({ name: 'groupId', type: Number })
  @ApiResponse({ status: 200, type: [ResourceIntroductionSchedule] })
  list(@Param('groupId', ParseIntPipe) groupId: number) {
    return this.svc.findAll({ resourceGroupId: groupId });
  }

  @Get(':scheduleId')
  @ApiOperation({ summary: 'Get one schedule', operationId: 'getGroupIntroductionSchedule' })
  @ApiParam({ name: 'groupId', type: Number })
  @ApiParam({ name: 'scheduleId', type: Number })
  @ApiResponse({ status: 200, type: ResourceIntroductionSchedule })
  getOne(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('scheduleId', ParseIntPipe) scheduleId: number
  ) {
    return this.svc.getOne({ resourceGroupId: groupId }, scheduleId);
  }

  @Post()
  @Auth('canManageResources')
  @ApiOperation({ summary: 'Create schedule', operationId: 'createGroupIntroductionSchedule' })
  @ApiParam({ name: 'groupId', type: Number })
  @ApiResponse({ status: 201, type: ResourceIntroductionSchedule })
  create(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() dto: CreateIntroductionScheduleDto
  ) {
    return this.svc.create({ resourceGroupId: groupId }, dto);
  }

  @Patch(':scheduleId')
  @Auth('canManageResources')
  @ApiOperation({ summary: 'Update schedule', operationId: 'updateGroupIntroductionSchedule' })
  @ApiParam({ name: 'groupId', type: Number })
  @ApiParam({ name: 'scheduleId', type: Number })
  @ApiResponse({ status: 200, type: ResourceIntroductionSchedule })
  update(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
    @Body() dto: UpdateIntroductionScheduleDto
  ) {
    return this.svc.update({ resourceGroupId: groupId }, scheduleId, dto);
  }

  @Delete(':scheduleId')
  @Auth('canManageResources')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete schedule', operationId: 'deleteGroupIntroductionSchedule' })
  @ApiParam({ name: 'groupId', type: Number })
  @ApiParam({ name: 'scheduleId', type: Number })
  @ApiResponse({ status: 204 })
  async remove(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('scheduleId', ParseIntPipe) scheduleId: number
  ) {
    await this.svc.delete({ resourceGroupId: groupId }, scheduleId);
  }
}
