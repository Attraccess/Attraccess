import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ResourceMaintenanceSchedule } from '@attraccess/database-entities';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { CanManageMaintenance } from './canManageMaintenance.decorator';
import { MaintenanceScheduleService } from './maintenance-schedule.service';
import { CreateMaintenanceScheduleDto } from './dtos/create-maintenance-schedule.dto';
import { UpdateMaintenanceScheduleDto } from './dtos/update-maintenance-schedule.dto';

@ApiTags('Resource Maintenance Schedules')
@Controller('resources/:resourceId/maintenance-schedules')
export class MaintenanceScheduleController {
  constructor(private readonly scheduleService: MaintenanceScheduleService) { }

  @Get()
  @Auth()
  @ApiOperation({
    summary: 'List maintenance schedules for a resource',
    description: 'Get all maintenance schedules for the given resource',
    operationId: 'findMaintenanceSchedules',
  })
  @ApiParam({ name: 'resourceId', description: 'Resource ID', type: Number })
  @ApiResponse({ status: 200, description: 'List of schedules', type: [ResourceMaintenanceSchedule] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  async findSchedules(
    @Param('resourceId', ParseIntPipe) resourceId: number,
  ): Promise<ResourceMaintenanceSchedule[]> {
    return this.scheduleService.findAllByResourceId(resourceId);
  }

  @Get(':scheduleId')
  @Auth()
  @ApiOperation({
    summary: 'Get a maintenance schedule by ID',
    description: 'Get a single maintenance schedule',
    operationId: 'getMaintenanceSchedule',
  })
  @ApiParam({ name: 'resourceId', description: 'Resource ID', type: Number })
  @ApiParam({ name: 'scheduleId', description: 'Schedule ID', type: Number })
  @ApiResponse({ status: 200, description: 'Schedule', type: ResourceMaintenanceSchedule })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  async getSchedule(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
  ): Promise<ResourceMaintenanceSchedule> {
    return this.scheduleService.getOne(resourceId, scheduleId);
  }

  @Post()
  @CanManageMaintenance()
  @ApiOperation({
    summary: 'Create a maintenance schedule',
    description: 'Create a new maintenance schedule for the resource',
    operationId: 'createMaintenanceSchedule',
  })
  @ApiParam({ name: 'resourceId', description: 'Resource ID', type: Number })
  @ApiResponse({ status: 201, description: 'Schedule created', type: ResourceMaintenanceSchedule })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  async createSchedule(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() dto: CreateMaintenanceScheduleDto,
  ): Promise<ResourceMaintenanceSchedule> {
    return this.scheduleService.create(resourceId, dto);
  }

  @Put(':scheduleId')
  @CanManageMaintenance()
  @ApiOperation({
    summary: 'Update a maintenance schedule',
    description: 'Update an existing maintenance schedule',
    operationId: 'updateMaintenanceSchedule',
  })
  @ApiParam({ name: 'resourceId', description: 'Resource ID', type: Number })
  @ApiParam({ name: 'scheduleId', description: 'Schedule ID', type: Number })
  @ApiResponse({ status: 200, description: 'Schedule updated', type: ResourceMaintenanceSchedule })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  async updateSchedule(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
    @Body() dto: UpdateMaintenanceScheduleDto,
  ): Promise<ResourceMaintenanceSchedule> {
    return this.scheduleService.update(resourceId, scheduleId, dto);
  }

  @Delete(':scheduleId')
  @CanManageMaintenance()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a maintenance schedule',
    description: 'Delete a maintenance schedule',
    operationId: 'deleteMaintenanceSchedule',
  })
  @ApiParam({ name: 'resourceId', description: 'Resource ID', type: Number })
  @ApiParam({ name: 'scheduleId', description: 'Schedule ID', type: Number })
  @ApiResponse({ status: 204, description: 'Schedule deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  async deleteSchedule(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
  ): Promise<void> {
    await this.scheduleService.delete(resourceId, scheduleId);
  }
}
