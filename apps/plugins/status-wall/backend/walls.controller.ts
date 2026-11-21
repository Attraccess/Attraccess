import { Auth } from '@attraccess/plugins-backend-sdk';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
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
  create(@Body(validated(WallBody)) body: WallBody): Promise<Wall> {
    return this.walls.create(body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Rename a status wall or change what it shows (the link stays)' })
  @ApiParam(WALL_ID)
  @ApiBody({ type: WallBody })
  @ApiOkResponse({ type: WallDto })
  @ApiNotFoundResponse()
  update(@Param('id', ParseIntPipe) id: number, @Body(validated(WallBody)) body: WallBody): Promise<Wall> {
    return this.walls.update(id, body);
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
