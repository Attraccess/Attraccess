import { Auth, AuthenticatedRequest, ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/plugins-backend-sdk';
import { Get, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ResourceFlowDefinitionRoutes } from './resource-flow-definition.routes';
export abstract class ResourceFlowButtonsRoutes extends ResourceFlowDefinitionRoutes {
  @Post('/buttons/:buttonId/press')
  @Auth()
  @ApiOperation({
    summary: 'Press a button',
    description: 'Press a button to trigger the flow',
    operationId: 'pressButton',
  })
  @ApiParam({
    name: 'buttonId',
    description: 'The ID of the button to press',
    type: 'string',
    example: 'lsHVcGBwIbOGxez5fBM68',
  })
  @ApiResponse({
    status: 200,
    description: 'Button pressed successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'OK' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'UNKNOWN_BUTTON_ID',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions to manage resources',
  })
  async pressButton(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('buttonId') buttonId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.resourceFlowsExecutorService.pressButton(resourceId, buttonId, req.user.id);
    return 'OK';
  }

  @Get('/buttons')
  @Auth()
  @ApiOperation({
    summary: 'Get buttons',
    description: 'Get buttons for a resource',
    operationId: 'getButtons',
  })
  @ApiParam({
    name: 'resourceId',
    description: 'The ID of the resource to get buttons for',
    type: 'integer',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Buttons retrieved successfully',
    type: ResourceFlowNode,
    isArray: true,
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions to manage resources',
  })
  async getButtons(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<ResourceFlowNode[]> {
    return await this.resourceFlowsService.getNodes(resourceId, ResourceFlowNodeType.INPUT_BUTTON);
  }
}
