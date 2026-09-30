import { Body, Controller, Delete, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, ResourceFlowVariableScope } from '@attraccess/plugins-backend-sdk';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';
import { FlowVariableDto, FlowVariableUpsertDto } from './dto/flow-variable.dto';

@ApiTags('Flow Variables')
@Controller('resources/:resourceId/flow-variables')
@Auth('resources.update')
export class ResourceFlowVariablesController {
  constructor(private readonly service: ResourceFlowVariablesService) {}

  @Get()
  @ApiOperation({ summary: 'List flow variables for a resource', operationId: 'listFlowVariables' })
  @ApiResponse({ status: 200, type: FlowVariableDto, isArray: true })
  async list(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<FlowVariableDto[]> {
    const rows = await this.service.listForResource(resourceId);
    return rows.map((row) => ({
      id: row.id,
      scope: row.scope,
      resourceId: row.resourceId,
      key: row.key,
      value: this.service.parseValue(row),
      valueType: row.valueType,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  @Put(':scope/:key')
  @ApiOperation({ summary: 'Upsert a flow variable', operationId: 'upsertFlowVariable' })
  @ApiParam({ name: 'scope', enum: ResourceFlowVariableScope, enumName: 'ResourceFlowVariableScope' })
  @ApiParam({ name: 'key' })
  @ApiResponse({ status: 204 })
  async upsert(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('scope') scope: ResourceFlowVariableScope,
    @Param('key') key: string,
    @Body() body: FlowVariableUpsertDto,
  ): Promise<void> {
    await this.service.set(scope, resourceId, key, body.value, resourceId);
  }

  @Delete(':scope/:key')
  @ApiOperation({ summary: 'Delete a flow variable', operationId: 'deleteFlowVariable' })
  @ApiParam({ name: 'scope', enum: ResourceFlowVariableScope, enumName: 'ResourceFlowVariableScope' })
  @ApiParam({ name: 'key' })
  @ApiResponse({ status: 204 })
  async remove(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('scope') scope: ResourceFlowVariableScope,
    @Param('key') key: string,
  ): Promise<void> {
    await this.service.delete(scope, resourceId, key);
  }
}
