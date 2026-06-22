import { Controller, Get, Patch, Delete, Param, Body, ParseIntPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { CompanionService } from './companion.service';
import { CompanionDevice } from '@attraccess/database-entities';

class UpdateCompanionDeviceDto {
  name!: string;
}

@ApiTags('Companion')
@Controller('companion/devices')
@Auth('canManageSystemConfiguration')
export class CompanionController {
  constructor(private readonly service: CompanionService) {}

  @Get()
  @ApiOperation({ summary: 'List all companion devices', operationId: 'listCompanionDevices' })
  @ApiResponse({ status: 200, type: [CompanionDevice] })
  list(): Promise<CompanionDevice[]> {
    return this.service.findAll();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update companion device name', operationId: 'updateCompanionDevice' })
  @ApiResponse({ status: 200, type: CompanionDevice })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCompanionDeviceDto,
  ): Promise<CompanionDevice> {
    return this.service.updateName(id, body.name);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a companion device', operationId: 'deleteCompanionDevice' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.service.delete(id);
  }
}
