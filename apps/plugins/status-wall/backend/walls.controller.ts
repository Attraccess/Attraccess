import { Auth, NotAnMcpTool, type AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { WallBody, WallDto } from './dto';
import { STATUS_WALL_MANAGE_PERMISSION } from './permissions';
import { validated } from './pipes';
import { WallsService, type Wall } from './walls.service';

const WALL_ID = { name: 'id', type: Number } as const;

/** Wall management. The public link of a wall is part of its answer, so managers can open it on any screen. */
@ApiTags('Status walls')
@Auth(STATUS_WALL_MANAGE_PERMISSION)
@NotAnMcpTool('Secret management: every answer carries the public link token')
@Controller('status-wall/walls')
export class WallsController {
  constructor(@Inject(WallsService) private readonly walls: WallsService) {}

  @Get()
  @ApiOperation({ summary: 'All status walls' })
  @ApiOkResponse({ type: [WallDto] })
  list(): Promise<Wall[]> {
    return this.walls.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create a status wall' })
  @ApiBody({ type: WallBody })
  @ApiCreatedResponse({ type: WallDto })
  @ApiForbiddenResponse({ description: '"All resources" needs a manager who sees the whole machine list' })
  @ApiNotFoundResponse({ description: 'A selected resource or group does not exist or is hidden from the caller' })
  create(@Body(validated(WallBody)) body: WallBody, @Req() request: AuthenticatedRequest): Promise<Wall> {
    return this.walls.create(request.user, body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Rename a status wall or change what it shows (the link stays)' })
  @ApiParam(WALL_ID)
  @ApiBody({ type: WallBody })
  @ApiOkResponse({ type: WallDto })
  @ApiForbiddenResponse({ description: '"All resources" needs a manager who sees the whole machine list' })
  @ApiNotFoundResponse({ description: 'Unknown wall, or a selected resource or group that is missing or hidden' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(validated(WallBody)) body: WallBody,
    @Req() request: AuthenticatedRequest,
  ): Promise<Wall> {
    return this.walls.update(request.user, id, body);
  }

  @Post(':id/regenerate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Issue a new public link; screens with the old one stop showing the wall' })
  @ApiParam(WALL_ID)
  @ApiOkResponse({ type: WallDto })
  @ApiNotFoundResponse()
  regenerate(@Param('id', ParseIntPipe) id: number): Promise<Wall> {
    return this.walls.regenerateToken(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a status wall (its link answers 404 from now on)' })
  @ApiParam(WALL_ID)
  @ApiNotFoundResponse()
  async delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.walls.delete(id);
  }
}
