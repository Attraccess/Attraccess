import { auditActorOf } from '../../../audit/recorder/audit-event';
import type { UsageSession } from '@attraccess/application-models';

import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';

import { Controller, ForbiddenException, Get, Param, ParseIntPipe, Post, Query, Req, Body, Put } from '@nestjs/common';

import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { NetworkRestrictedAction } from '@attraccess/application-models';
import { NetworkRestrictionService } from '../../../network-restriction/network-restriction.service';
import { CanControlResponseDto } from '../dtos/canControl.response.dto';

import { StartBlockedResponseDto } from '../dtos/startBlocked.response.dto';

import { GetResourceHistoryQueryDto } from '../dtos/getResourceHistoryQuery.dto';

import { ResourceUsageResponseDto } from '../dtos/resource-usage-response.dto';

import { GetResourceHistoryResponseDto } from '../dtos/GetResourceHistoryResponse.dto';

import { ResourceUsageService } from './resource-usage.service';
import { PreStartService } from '../pre-start/pre-start.service';
import { SessionEndNotifier } from '../pre-start/session-end-notifier.service';
import { ResourceActivityVisibilityService } from '../authorization/resource-activity-visibility.service';
import { EndUsageSessionDto } from '../dtos/endUsageSession.dto';
import { ExtendUsageSessionDto } from '../dtos/extendUsageSession.dto';

import { GetActiveUsageSessionDto } from '../dtos/getActiveUsageSession.dto';
import { toUsageSessionResponse, type UsageSessionResponse } from '../dtos/usage-session-response';

import { StartUsageSessionDto } from '../dtos/startUsageSession.dto';

import { UpdateUsageSessionProjectDto } from '../dtos/updateUsageSessionProject.dto';
import { SwitchUsageSessionProjectDto } from '../dtos/switchUsageSessionProject.dto';
import { ResourceListVisible } from '../../visibility/resource-list-visible.interceptor';

@ApiTags('Resources')
@ResourceListVisible()
@Controller('resources/:resourceId/usage')
export class ResourceUsageController {
  constructor(
    protected readonly resourceUsageService: ResourceUsageService,
    protected readonly activityVisibility: ResourceActivityVisibilityService,
    protected readonly preStart: PreStartService,
    protected readonly sessionEnd: SessionEndNotifier,
    protected readonly networkRestriction: NetworkRestrictionService,
  ) {}

  @Post('lock')
  @Auth()
  @ApiOperation({ summary: 'Lock a resource of door type', operationId: 'lockDoor' })
  @ApiResponse({
    status: 200,
    description: 'Door locked successfully.',
    type: ResourceUsageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
  })
  async lockDoor(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<UsageSessionResponse> {
    await this.networkRestriction.assertAllowed(req, NetworkRestrictedAction.DoorLock, resourceId);
    return toUsageSessionResponse(await this.resourceUsageService.lockDoor(resourceId, req.user));
  }

  @Post('unlock')
  @Auth()
  @ApiOperation({ summary: 'Unlock a resource of door type', operationId: 'unlockDoor' })
  @ApiResponse({
    status: 200,
    description: 'Door unlocked successfully.',
    type: ResourceUsageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
  })
  async unlockDoor(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<UsageSessionResponse> {
    // On an access-only door an unlock opens it, so it needs what Open needs.
    const action = (await this.resourceUsageService.isAccessOnlyDoor(resourceId))
      ? NetworkRestrictedAction.DoorOpen
      : NetworkRestrictedAction.DoorUnlock;
    await this.networkRestriction.assertAllowed(req, action, resourceId);
    return toUsageSessionResponse(await this.resourceUsageService.unlockDoor(resourceId, req.user));
  }

  @Post('unlatch')
  @Auth()
  @ApiOperation({ summary: 'Unlatch a resource of door type (if supported)', operationId: 'unlatchDoor' })
  @ApiResponse({
    status: 200,
    description: 'Door unlatch successfully.',
    type: ResourceUsageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
  })
  async unlatchDoor(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<UsageSessionResponse> {
    await this.networkRestriction.assertAllowed(req, NetworkRestrictedAction.DoorUnlatch, resourceId);
    return toUsageSessionResponse(await this.resourceUsageService.unlatchDoor(resourceId, req.user));
  }

  @Post('open')
  @Auth()
  @ApiOperation({ summary: 'Open an access-only door', operationId: 'openDoor' })
  @ApiResponse({
    status: 200,
    description: 'Door opened successfully (recorded as a door unlock).',
    type: ResourceUsageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - The resource is not an access-only door',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
  })
  async openDoor(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<UsageSessionResponse> {
    await this.networkRestriction.assertAllowed(req, NetworkRestrictedAction.DoorOpen, resourceId);
    return toUsageSessionResponse(await this.resourceUsageService.openDoor(resourceId, req.user));
  }

  @Get('history')
  @Auth()
  @ApiOperation({ summary: 'Get usage history for a resource', operationId: 'resourceUsageGetHistory' })
  @ApiResponse({
    status: 200,
    description: 'Resource usage history retrieved successfully.',
    type: GetResourceHistoryResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid pagination parameters',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
  })
  async getHistory(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Query() query: GetResourceHistoryQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<GetResourceHistoryResponseDto> {
    // The shared visibility rule (session variant) decides: full sees every session, anonymous sees them redacted, none only their own.
    const access = await this.activityVisibility.resolveSessions(req.user, resourceId);
    const isViewingOwnHistory = query.userId === req.user.id || query.userId === undefined;

    // Filtering by another user would link a name to the redacted sessions, so it needs full access.
    if (access !== 'full' && !isViewingOwnHistory) {
      throw new ForbiddenException('You can only view your own usage history');
    }
    if (access === 'none') {
      query.userId = req.user.id;
    }

    const { data: sessions, total } = await this.resourceUsageService.getResourceUsageHistory(
      resourceId,
      query.page,
      query.limit,
      query.userId,
    );
    const data = sessions
      .map((session) => this.activityVisibility.viewUsage(session, access, req.user.id))
      .filter((session): session is UsageSession => session !== null)
      .map(toUsageSessionResponse);

    return {
      data,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  @Get('can-control')
  @Auth()
  @ApiOperation({ summary: 'Check if the current user can control a resource', operationId: 'resourceUsageCanControl' })
  @ApiResponse({
    status: 200,
    description: 'User can control resource',
    type: CanControlResponseDto,
  })
  async canControl(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<CanControlResponseDto> {
    return {
      canControl: await this.resourceUsageService.canControllResource(resourceId, req.user),
    } as CanControlResponseDto;
  }

  @Get('start-blocked')
  @Auth()
  @ApiOperation({
    summary: 'Ask whether a plugin currently blocks the start for the current user',
    description:
      'Informational counterpart of the pre-start gate, for showing the reason in place of the start button. ' +
      'A start is still checked when it is requested.',
    operationId: 'resourceUsageStartBlocked',
  })
  @ApiResponse({ status: 200, description: 'The start-blocked state', type: StartBlockedResponseDto })
  async startBlocked(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<StartBlockedResponseDto> {
    const view = await this.preStart.queryStartBlocked(resourceId, req.user);
    return view
      ? { blocked: true, reason: view.reason, ...(view.until ? { until: view.until } : {}), plugin: view.plugin }
      : { blocked: false };
  }

  @Post('start')
  @Auth()
  @ApiOperation({ summary: 'Start a resource usage session', operationId: 'resourceUsageStartSession' })
  @ApiResponse({
    status: 201,
    description: 'Usage session started successfully.',
    type: ResourceUsageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
  })
  async startSession(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() dto: StartUsageSessionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UsageSessionResponse> {
    // Before the plugin pre-start gate: a refused request must not trigger any side effect.
    await this.networkRestriction.assertAllowed(
      req,
      dto.forceTakeOver ? NetworkRestrictedAction.UsageTakeover : NetworkRestrictedAction.UsageStart,
      resourceId,
    );
    // Only a browser session is "web"; API-token and MCP clients are programmatic.
    const origin =
      req.user.authenticationMethod === undefined || req.user.authenticationMethod === 'session' ? 'web' : 'api';
    const confirmedStepKeys = await this.preStart.gateHttp(resourceId, req.user, dto, {
      origin,
      authenticationMethod: req.user.authenticationMethod,
      ...(req.user.apiTokenId === undefined ? {} : { apiTokenId: req.user.apiTokenId }),
    });
    const started = await this.resourceUsageService.startSession(resourceId, req.user, dto, {
      auditOrigin: auditActorOf(req.user),
      origin,
      confirmedStepKeys,
      canAskDuration: true,
    });
    return toUsageSessionResponse(started);
  }

  @Put('end')
  @Auth()
  @ApiOperation({ summary: 'End a resource usage session', operationId: 'resourceUsageEndSession' })
  @ApiResponse({
    status: 200,
    description: 'Usage session ended successfully.',
    type: ResourceUsageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad Request - Invalid input data, no active session, or NoOwnActiveSessionError (no usageId and the caller has no own session on a shared machine)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource or session not found',
  })
  async endSession(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() dto: EndUsageSessionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UsageSessionResponse> {
    await this.networkRestriction.assertAllowed(req, NetworkRestrictedAction.UsageEnd, resourceId);
    const ended = await this.resourceUsageService.endSession(resourceId, req.user, dto, {
      auditOrigin: auditActorOf(req.user),
    });
    if (ended) {
      // Nobody can answer an after-stop question on web/API, also when a manager ends someone else's session.
      void this.sessionEnd.applyDefault(
        { resourceId, userId: ended.userId, sessionId: ended.id },
        req.user.authenticationMethod === undefined || req.user.authenticationMethod === 'session' ? 'web' : 'api',
        req.user.locale,
      );
    }
    return ended && toUsageSessionResponse(ended);
  }

  @Post('extend')
  @Auth()
  @ApiOperation({
    summary: 'Extend the automatic end of a running session',
    description:
      'Moves the automatic end of your own session (or of one you may end) later by 60, 120, 240, 360, 720 or 1440 minutes, or to the maximum with `toMax`. Refused with a machine-readable `code` when the session has no automatic end (SESSION_EXTENSION_NOT_POSSIBLE), would exceed the maximum session time (SESSION_EXTENSION_EXCEEDS_MAXIMUM) or the request names no permitted step (SESSION_EXTENSION_INVALID). Nothing is clipped.',
    operationId: 'resourceUsageExtendSession',
  })
  @ApiResponse({
    status: 201,
    description: 'The session with its new automatic end (`autoEndAt`).',
    type: ResourceUsageResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request - the extension is not possible; see `code`' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - You may not end this session' })
  async extendSession(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() dto: ExtendUsageSessionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UsageSessionResponse> {
    const extended = await this.resourceUsageService.extendSession(resourceId, req.user, dto, auditActorOf(req.user));
    return toUsageSessionResponse(extended);
  }

  @Put('sessions/:usageId/project')
  @Auth()
  @ApiOperation({
    summary: 'Update usage session project assignment',
    operationId: 'resourceUsageUpdateSessionProject',
  })
  @ApiResponse({
    status: 200,
    description: 'Usage session project updated successfully.',
    type: ResourceUsageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input data or session is active',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User is not authorized to update this session',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource or session not found',
  })
  async updateSessionProject(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('usageId', ParseIntPipe) usageId: number,
    @Body() dto: UpdateUsageSessionProjectDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UsageSessionResponse> {
    return toUsageSessionResponse(
      await this.resourceUsageService.updateSessionProject(resourceId, usageId, req.user, dto),
    );
  }

  @Post('sessions/active/project')
  @Auth()
  @ApiOperation({
    summary: 'Change the project of a running session',
    description:
      "Moves your own running machine session to another of your projects, or to no project, without stopping the machine. The required `mode` says what the change applies to.\n\n`whole-session`: the running usage record only changes its project, so everything used in it so far counts for the new project. Nothing is metered or billed, and `projectSwitchCharging` plays no role. Only the project-reassigned flows and project-reassign forms take part. Earlier parts of a session that was split before keep their projects.\n\n`split`: the running record ends now and a continuation (linked through `previousUsageId`) starts at the same instant. Usage before the split is booked to the old project, usage after it to the new one; how the continuation is charged follows the resource's billing setting `projectSwitchCharging`. Only the project-switched flows and project-switch forms take part.\n\nIf a flow, or with `split` a meter reading or the balance check, fails, nothing changes. Use `PUT sessions/{usageId}/project` for sessions that have ended.",
    operationId: 'resourceUsageSwitchSessionProject',
  })
  @ApiResponse({
    status: 201,
    description: "The running session: the same record for 'whole-session', the continuation for 'split'.",
    type: ResourceUsageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad Request - `mode` is missing or unknown, the session already belongs to this project, a required form is missing or a flow failed; with `split` also: the balance does not cover a new session, or a meter could not be read',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - The named session belongs to somebody else' })
  @ApiResponse({ status: 404, description: 'No such running session, or the project is not one of yours' })
  @ApiResponse({ status: 409, description: 'Conflict - another change of the machine is in progress' })
  async switchSessionProject(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() dto: SwitchUsageSessionProjectDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UsageSessionResponse> {
    // Booking further usage is starting a session as far as the network restriction is concerned.
    await this.networkRestriction.assertAllowed(req, NetworkRestrictedAction.UsageStart, resourceId);
    return toUsageSessionResponse(
      await this.resourceUsageService.switchSessionProject(resourceId, req.user, dto, {
        auditOrigin: auditActorOf(req.user),
      }),
    );
  }

  @Get('active')
  @Auth()
  @ApiOperation({
    summary: "Get the active usage sessions of a resource (the caller's own session first)",
    operationId: 'resourceUsageGetActiveSession',
  })
  @ApiResponse({
    status: 200,
    description: 'Active session retrieved successfully.',
    type: GetActiveUsageSessionDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  @ApiResponse({
    status: 404,
    description: 'Resource not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Activity on this resource is not visible to the user',
  })
  public async getActiveSession(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<GetActiveUsageSessionDto> {
    const access = await this.activityVisibility.resolve(req.user, resourceId);
    const overview = await this.resourceUsageService.getActiveSessionOverview(resourceId, req.user.id);
    // Hidden activity: a viewer sees only what the visibility rule allows (own session in full, others redacted).
    const view = (usage: UsageSession) => this.activityVisibility.viewUsage(usage, access, req.user.id);
    const usages = overview.usages.flatMap((usage) => view(usage) ?? []);
    if (overview.usages.length > 0 && usages.length === 0) {
      throw new ForbiddenException('You cannot view activity on this resource');
    }
    if (overview.usages.length === 0 && access === 'none') {
      throw new ForbiddenException('You cannot view activity on this resource');
    }
    const usage = overview.usage ? view(overview.usage) : null;
    const shown = usage ?? usages[usages.length - 1] ?? null;
    return {
      ...overview,
      usage: shown && toUsageSessionResponse(shown),
      usages: usages.map(toUsageSessionResponse),
    };
  }

  @Get(':usageId')
  @Auth()
  @ApiOperation({ summary: 'Get a resource usage session', operationId: 'resourceUsageGetSession' })
  @ApiResponse({ status: 200, description: 'The usage session details.', type: ResourceUsageResponseDto })
  @ApiResponse({ status: 404, description: 'Usage session not found or not accessible.' })
  async getSession(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('usageId', ParseIntPipe) usageId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<UsageSessionResponse> {
    const access = await this.activityVisibility.resolveSessions(req.user, resourceId);
    // Other people's sessions open for full access or project members; anonymous access gets the redacted view.
    const session = await this.resourceUsageService.getSessionDetails(
      resourceId,
      usageId,
      req.user,
      access === 'full',
      access === 'anonymous' ? (usage) => this.activityVisibility.redactUsage(usage) : undefined,
    );
    return toUsageSessionResponse(session);
  }
}
