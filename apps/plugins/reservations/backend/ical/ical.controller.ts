import { Auth, type AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { validated } from '../api/pipes';
import { ApiReservationErrors, principalOf } from '../api/support';
import { Clock, RESERVATION_CLOCK } from '../constants';
import { CreateIcalFeedBody, IcalFeedDto, IcalFeedSecretDto, UpdateIcalFeedBody } from './ical.dto';
import { IcalService } from './ical.service';
import { RateLimiter } from './rate-limiter';

const FEED_ID = { name: 'id', type: Number } as const;

/** Feed management for the signed-in user (session or API token). */
@ApiTags('Reservations')
@Auth()
@Controller('reservations/ical/feeds')
export class IcalFeedsController {
  constructor(@Inject(IcalService) private readonly ical: IcalService) {}

  @Get()
  @ApiOperation({ summary: 'My calendar feeds (without their secret URLs)' })
  @ApiOkResponse({ type: [IcalFeedDto] })
  list(@Req() request: AuthenticatedRequest): Promise<IcalFeedDto[]> {
    return this.ical.list(principalOf(request).userId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a calendar feed',
    description: 'The subscription URL and token are returned ONLY here and on regenerate.',
  })
  @ApiBody({ type: CreateIcalFeedBody })
  @ApiCreatedResponse({ type: IcalFeedSecretDto })
  @ApiReservationErrors({ badRequest: true, conflict: ['FEED_LIMIT'] })
  create(
    @Body(validated(CreateIcalFeedBody)) body: CreateIcalFeedBody,
    @Req() request: AuthenticatedRequest,
  ): Promise<IcalFeedSecretDto> {
    return this.ical.create(principalOf(request), body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a feed or change what it shows (the URL stays)' })
  @ApiParam(FEED_ID)
  @ApiBody({ type: UpdateIcalFeedBody })
  @ApiOkResponse({ type: IcalFeedDto })
  @ApiReservationErrors({ badRequest: true, notFound: true })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(validated(UpdateIcalFeedBody)) body: UpdateIcalFeedBody,
    @Req() request: AuthenticatedRequest,
  ): Promise<IcalFeedDto> {
    return this.ical.update(principalOf(request), id, body);
  }

  @Post(':id/regenerate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Issue a new secret URL; the old one answers 404 immediately',
    description: 'The new URL and token are returned ONLY here.',
  })
  @ApiParam(FEED_ID)
  @ApiOkResponse({ type: IcalFeedSecretDto })
  @ApiReservationErrors({ notFound: true })
  regenerate(@Param('id', ParseIntPipe) id: number, @Req() request: AuthenticatedRequest): Promise<IcalFeedSecretDto> {
    return this.ical.regenerate(principalOf(request), id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke a feed (its URL answers 404 from now on)' })
  @ApiParam(FEED_ID)
  @ApiReservationErrors({ notFound: true })
  async revoke(@Param('id', ParseIntPipe) id: number, @Req() request: AuthenticatedRequest): Promise<void> {
    await this.ical.revoke(principalOf(request), id);
  }
}

export const ICAL_RATE_LIMIT = { perFeedPerMinute: 60, perIpPerMinute: 240 } as const;

/**
 * Public calendar endpoint: NO auth guard on purpose, the secret token in the URL is the credential
 * (core registers no global authentication guard, only the cross-site write guard, which ignores GET).
 * Unknown and revoked tokens answer an identical 404. Rate limited per IP+token and per IP.
 */
@ApiTags('Reservations')
@Controller('reservations/ical')
export class IcalPublicController {
  private readonly perFeed = new RateLimiter(ICAL_RATE_LIMIT.perFeedPerMinute, 60_000);
  private readonly perIp = new RateLimiter(ICAL_RATE_LIMIT.perIpPerMinute, 60_000);

  constructor(
    @Inject(IcalService) private readonly ical: IcalService,
    @Inject(RESERVATION_CLOCK) private readonly clock: Clock,
  ) {}

  @Get(':file')
  @Header('Cache-Control', 'private, max-age=60')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @ApiOperation({ summary: 'iCalendar feed (the token in the URL is the credential; no session)' })
  @ApiParam({ name: 'file', type: String, description: '`<token>.ics`' })
  @ApiProduces('text/calendar')
  @ApiOkResponse({ description: 'RFC 5545 calendar', schema: { type: 'string' } })
  @ApiReservationErrors({ notFound: true })
  async feed(
    @Param('file') file: string,
    @Req() request: { ip?: string },
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ): Promise<string> {
    if (!file.endsWith('.ics')) throw new NotFoundException();
    const token = file.slice(0, -4);
    const now = this.clock().getTime();
    const ip = request.ip ?? 'unknown';
    const wait = Math.max(this.perIp.hit(ip, now), this.perFeed.hit(`${ip}|${token}`, now));
    if (wait > 0) {
      response.setHeader('Retry-After', String(wait));
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    const calendar = await this.ical.renderForToken(token);
    if (calendar === null) throw new NotFoundException();
    return calendar;
  }
}
