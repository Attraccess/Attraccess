import {
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Req,
  Res,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { filter, interval, map, merge, type Observable } from 'rxjs';
import { Clock, STATUS_WALL_CLOCK } from './constants';
import { WallSnapshotDto } from './dto';
import { RateLimiter } from './rate-limiter';
import { WallSnapshotService, type WallSnapshot } from './wall-snapshot.service';
import { WallStatusService } from './wall-status.service';
import { WallsService, type Wall } from './walls.service';

export const PUBLIC_RATE_LIMIT = { perWallPerMinute: 120, perIpPerMinute: 600 } as const;

/** Comment frames keep idle connections open through proxies that close silent ones. */
export const HEARTBEAT_MS = 25_000;

const TOKEN = { name: 'token', type: String, description: 'Secret of the wall link' } as const;

/**
 * What a status wall screen reads. NO auth guard on purpose: the secret token in the URL is the credential (core
 * registers no global authentication guard, only the cross-site write guard, which ignores GET). Unknown, replaced
 * and malformed tokens answer an identical 404. Requests are limited per IP and per IP + wall, generously enough for
 * several screens behind one address.
 */
@ApiTags('Status walls')
@Controller('status-wall/public')
export class PublicWallController {
  private readonly perWall = new RateLimiter(PUBLIC_RATE_LIMIT.perWallPerMinute, 60_000);
  private readonly perIp = new RateLimiter(PUBLIC_RATE_LIMIT.perIpPerMinute, 60_000);

  constructor(
    @Inject(WallsService) private readonly walls: WallsService,
    @Inject(WallSnapshotService) private readonly snapshots: WallSnapshotService,
    @Inject(WallStatusService) private readonly status: WallStatusService,
    @Inject(STATUS_WALL_CLOCK) private readonly clock: Clock,
  ) {}

  @Get(':token')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Current state of every resource on the wall (the token in the URL is the credential)' })
  @ApiParam(TOKEN)
  @ApiOkResponse({ type: WallSnapshotDto })
  @ApiNotFoundResponse()
  async snapshot(
    @Param('token') token: string,
    @Req() request: { ip?: string },
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ): Promise<WallSnapshot> {
    const wall = await this.resolve(token, request, response);
    return this.snapshots.snapshot(wall);
  }

  @Sse(':token/events')
  @ApiOperation({ summary: 'Server-sent `changed` events whenever a resource on the wall changes state' })
  @ApiParam(TOKEN)
  @ApiNotFoundResponse()
  async events(
    @Param('token') token: string,
    @Req() request: { ip?: string },
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ): Promise<Observable<MessageEvent>> {
    const wall = await this.resolve(token, request, response);
    // Membership is fixed for the life of the stream; screens refetch on a timer as well, which picks up the rest.
    const resourceIds = await this.walls.resourceIdsOf(wall.selection);
    const shown = resourceIds ? new Set(resourceIds) : null;
    const changes = this.status.changes().pipe(
      filter((resourceId) => shown === null || shown.has(resourceId)),
      map((resourceId): MessageEvent => ({ type: 'changed', data: { resourceId } })),
    );
    const heartbeat = interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ type: 'heartbeat', data: {} })));
    return merge(changes, heartbeat);
  }

  private async resolve(
    token: string,
    request: { ip?: string },
    response: { setHeader(name: string, value: string): void },
  ): Promise<Wall> {
    const now = this.clock().getTime();
    const ip = (request.ip ?? 'unknown').slice(0, 64);
    let wait = this.perIp.hit(ip, now);
    if (wait === 0) wait = this.perWall.hit(`${ip}|${token.slice(0, 128)}`, now);
    if (wait > 0) {
      response.setHeader('Retry-After', String(wait));
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    const wall = await this.walls.findByToken(token);
    if (!wall) throw new NotFoundException();
    return wall;
  }
}
