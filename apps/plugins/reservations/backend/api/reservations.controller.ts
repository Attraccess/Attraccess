import { Auth, type AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Controller, Get, HttpCode, Inject, Param, ParseIntPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PendingDecisionService } from '../hooks/pending-decision.service';
import { BOOKING_CONFLICT_CODES, STATE_CONFLICT_CODES, ReservationError } from '../reservations/errors';
import { ReservationQueryService } from '../reservations/reservation-query.service';
import { ReservationService } from '../reservations/reservation.service';
import { CreateReservationBody, ReasonBody } from './dto.request';
import { AvailabilityDto, ManagedReservationListDto, ManagerAccessDto, ReservationDto } from './dto.response';
import { validated } from './pipes';
import { ApiReservationErrors, parseDate, parseInteger, parseStatus, principalOf, requireDate } from './support';

const RESERVATION_ID = { name: 'id', type: Number, description: 'Reservation id' } as const;
const STATUS_QUERY = {
  name: 'status',
  required: false,
  enum: ['pending', 'confirmed', 'rejected', 'cancelled', 'expired', 'no_show', 'completed'],
} as const;

@ApiTags('Reservations')
@Auth()
@Controller('reservations')
export class ReservationsController {
  constructor(
    @Inject(ReservationService) private readonly reservations: ReservationService,
    @Inject(ReservationQueryService) private readonly queries: ReservationQueryService,
    @Inject(PendingDecisionService) private readonly pendingDecisions: PendingDecisionService,
  ) {}

  @Get('resources/:resourceId/pending-decision')
  @ApiOperation({
    summary: 'The caller’s running booking that still awaits a "keep or free the rest?" answer on this resource',
    description:
      'Set when the holder stopped a session inside their own running booking (kept for 15 minutes in memory). The body is the booking, or the JSON value null when nothing is pending. Cleared by keep, end-early, expiry and the holder’s next session start.',
  })
  @ApiParam({ name: 'resourceId', type: Number })
  @ApiOkResponse({ type: ReservationDto, description: 'The booking, or null' })
  async pendingDecision(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() request: AuthenticatedRequest,
    @Res() response: { json(body: unknown): void },
  ): Promise<void> {
    response.json(await this.pendingDecisions.get(principalOf(request), resourceId));
  }

  @Get('resources/:resourceId/availability')
  @ApiOperation({
    summary: 'Bookings, booking rules and the caller’s booking permission of a resource for a time range',
    description:
      'Lists pending and confirmed bookings and maintenance that can collide with a booking inside [from, to), i.e. the range widened by the resource’s buffers. Other users’ bookings carry a holder id only for managers of the resource; the holder name is shown to the holder, managers and everyone who may see who uses the resource (core’s activity-visibility rule). Resources the caller cannot see answer 404.',
  })
  @ApiParam({ name: 'resourceId', type: Number })
  @ApiQuery({ name: 'from', type: String, description: 'ISO 8601 start of the range (inclusive)' })
  @ApiQuery({ name: 'to', type: String, description: 'ISO 8601 end of the range, at most 62 days after from' })
  @ApiOkResponse({ type: AvailabilityDto })
  @ApiReservationErrors({ badRequest: true, notFound: true })
  availability(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<AvailabilityDto> {
    return this.queries.availability(
      principalOf(request),
      resourceId,
      requireDate(from, 'from'),
      requireDate(to, 'to'),
    );
  }

  @Get('mine')
  @ApiOperation({ summary: 'List the caller’s own bookings' })
  @ApiQuery({ name: 'scope', required: false, enum: ['upcoming', 'past'], description: 'Default: upcoming' })
  @ApiQuery(STATUS_QUERY)
  @ApiOkResponse({ type: [ReservationDto] })
  @ApiReservationErrors({ badRequest: true })
  listMine(
    @Req() request: AuthenticatedRequest,
    @Query('scope') scope?: string,
    @Query('status') status?: string,
  ): Promise<ReservationDto[]> {
    if (scope !== undefined && scope !== 'upcoming' && scope !== 'past') {
      throw new ReservationError('INVALID_RANGE', 'scope must be upcoming or past');
    }
    return this.queries.listMine(
      principalOf(request),
      (scope as 'upcoming' | 'past' | undefined) ?? 'upcoming',
      parseStatus(status),
    );
  }

  @Get('manage/access')
  @ApiOperation({
    summary: 'Whether the caller manages any resource (shows the manager pages)',
    description: 'True for resources.update holders and for maintainers/introducers of at least one resource.',
  })
  @ApiOkResponse({ type: ManagerAccessDto })
  managerAccess(@Req() request: AuthenticatedRequest): Promise<ManagerAccessDto> {
    return this.queries.managerAccess(principalOf(request));
  }

  @Get('manage')
  @ApiOperation({
    summary: 'List bookings of the resources the caller manages',
    description:
      'resources.update sees all resources; maintainers and introducers see the resources they manage. 25 per page.',
  })
  @ApiQuery({ name: 'resourceId', required: false, type: Number })
  @ApiQuery(STATUS_QUERY)
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '1-based, default 1' })
  @ApiOkResponse({ type: ManagedReservationListDto })
  @ApiReservationErrors({ badRequest: true, forbidden: true })
  listManaged(
    @Req() request: AuthenticatedRequest,
    @Query('resourceId') resourceId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
  ): Promise<ManagedReservationListDto> {
    return this.queries.listManaged(principalOf(request), {
      resourceId: parseInteger(resourceId, 'resourceId'),
      status: parseStatus(status),
      from: parseDate(from, 'from'),
      to: parseDate(to, 'to'),
      page: parseInteger(page, 'page', 1) ?? 1,
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Book a resource',
    description:
      'Creates a confirmed booking, or a pending one when the resource requires approval. Violated rules answer 409 with a typed code.',
  })
  @ApiBody({ type: CreateReservationBody })
  @ApiCreatedResponse({ type: ReservationDto })
  @ApiReservationErrors({ badRequest: true, notFound: true, conflict: BOOKING_CONFLICT_CODES })
  async create(
    @Body(validated(CreateReservationBody)) body: CreateReservationBody,
    @Req() request: AuthenticatedRequest,
  ): Promise<ReservationDto> {
    const startTime = new Date(body.startTime);
    const endTime =
      body.endTime !== undefined
        ? new Date(body.endTime)
        : body.durationMinutes !== undefined
          ? new Date(startTime.getTime() + body.durationMinutes * 60_000)
          : null;
    if (!endTime) throw new ReservationError('INVALID_RANGE', 'Provide endTime or durationMinutes');
    const actor = principalOf(request);
    const created = await this.reservations.create(actor, {
      resourceId: body.resourceId,
      startTime,
      endTime,
      note: body.note,
    });
    return (await this.queries.present(actor, [created]))[0];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a booking (holder or manager of its resource)' })
  @ApiParam(RESERVATION_ID)
  @ApiOkResponse({ type: ReservationDto })
  @ApiReservationErrors({ notFound: true })
  get(@Param('id', ParseIntPipe) id: number, @Req() request: AuthenticatedRequest): Promise<ReservationDto> {
    return this.queries.get(principalOf(request), id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a pending or upcoming booking (holder, or a manager with a reason)' })
  @ApiParam(RESERVATION_ID)
  @ApiBody({ type: ReasonBody, required: false })
  @ApiOkResponse({ type: ReservationDto })
  @ApiReservationErrors({ notFound: true, conflict: ['NOT_CANCELLABLE', 'ALREADY_STARTED'] })
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body(validated(ReasonBody)) body: ReasonBody | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ReservationDto> {
    const actor = principalOf(request);
    return (await this.queries.present(actor, [await this.reservations.cancel(actor, id, body?.reason)]))[0];
  }

  @Post(':id/end-early')
  @HttpCode(200)
  @ApiOperation({ summary: 'End a running booking now and free the rest (holder or manager)' })
  @ApiParam(RESERVATION_ID)
  @ApiOkResponse({ type: ReservationDto })
  @ApiReservationErrors({ notFound: true, conflict: ['NOT_ACTIVE'] })
  async endEarly(@Param('id', ParseIntPipe) id: number, @Req() request: AuthenticatedRequest): Promise<ReservationDto> {
    const actor = principalOf(request);
    const ended = await this.reservations.endEarly(actor, id);
    this.pendingDecisions.clear(ended.userId, ended.resourceId);
    return (await this.queries.present(actor, [ended]))[0];
  }

  @Post(':id/keep')
  @HttpCode(200)
  @ApiOperation({ summary: 'Keep the booking ("still needed" / keep the rest after stopping); holder only' })
  @ApiParam(RESERVATION_ID)
  @ApiOkResponse({ type: ReservationDto })
  @ApiReservationErrors({ notFound: true, conflict: ['ALREADY_FINISHED'] })
  async keep(@Param('id', ParseIntPipe) id: number, @Req() request: AuthenticatedRequest): Promise<ReservationDto> {
    const actor = principalOf(request);
    const kept = await this.reservations.keep(actor, id);
    this.pendingDecisions.clear(kept.userId, kept.resourceId);
    return (await this.queries.present(actor, [kept]))[0];
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a pending booking (manager)' })
  @ApiParam(RESERVATION_ID)
  @ApiBody({ type: ReasonBody, required: false })
  @ApiOkResponse({ type: ReservationDto })
  @ApiReservationErrors({ notFound: true, forbidden: true, conflict: STATE_CONFLICT_CODES })
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @Body(validated(ReasonBody)) body: ReasonBody | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ReservationDto> {
    const actor = principalOf(request);
    return (await this.queries.present(actor, [await this.reservations.approve(actor, id, body?.reason)]))[0];
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a pending booking (manager)' })
  @ApiParam(RESERVATION_ID)
  @ApiBody({ type: ReasonBody, required: false })
  @ApiOkResponse({ type: ReservationDto })
  @ApiReservationErrors({ notFound: true, forbidden: true, conflict: STATE_CONFLICT_CODES })
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body(validated(ReasonBody)) body: ReasonBody | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ReservationDto> {
    const actor = principalOf(request);
    return (await this.queries.present(actor, [await this.reservations.reject(actor, id, body?.reason)]))[0];
  }
}
