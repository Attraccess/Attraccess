import { LifecycleBillingItem, Resource, ResourceUsage, User } from '@attraccess/database-entities';

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import { UserPermissionsChangedEvent } from '../../../users-and-auth/rbac/events/user-permissions-changed.event';

import { ResourceChangedEvent } from '../../events/resource-changed.event';

import { ResourceIntroducerChangedEvent } from '../../introducers/events/resource-introducer-changed.event';

import { UsageAccessCache } from '../authorization/usage-access-cache';

import { UsageResourceGate } from '../authorization/usage-resource-gate';

import { EndUsageSessionDto } from '../dtos/endUsageSession.dto';

import { StartUsageSessionDto } from '../dtos/startUsageSession.dto';

import { UpdateUsageSessionProjectDto } from '../dtos/updateUsageSessionProject.dto';

import { EndSessionOptions, StartSessionOptions, UsageLifecycle } from '../lifecycle/usage-lifecycle';

import { UsageDoorActions } from './usage-door-actions';

import { SessionEndTarget, UsageSessionEnds } from './usage-session-ends';

import { UsageSessionRecords } from './usage-session-records';

import { UsageSessionStartPreparation } from './usage-session-start-preparation';

import { UsageSessionStarts } from './usage-session-starts';

export { EndSessionOptions, StartSessionOptions } from '../lifecycle/usage-lifecycle';

/**
 * Usage sessions of resources: starts, stops, takeovers, door actions and their reads. The work is done by the
 * usage collaborators; this facade keeps one entry point for controllers, flows, readers and plugins.
 */
@Injectable()
export class ResourceUsageService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly lifecycle: UsageLifecycle,
    private readonly access: UsageAccessCache,
    private readonly gate: UsageResourceGate,
    private readonly records: UsageSessionRecords,
    private readonly doors: UsageDoorActions,
    private readonly preparation: UsageSessionStartPreparation,
    private readonly starts: UsageSessionStarts,
    private readonly ends: UsageSessionEnds,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.lifecycle.recoverInterruptedLifecycles();
    this.access.startCleanup();
    this.lifecycle.startSweep();
    await this.access.subscribe();
  }

  onModuleDestroy(): void {
    this.access.stopCleanup();
    this.lifecycle.stopSweep();
    this.access.unsubscribe();
  }

  /**
   * The caller's own active session when `preferUserId` has one, otherwise the newest.
   * Identical to the single-session behaviour at limit 1.
   */
  public async getActiveSession(
    resourceId: number,
    transactionalEntityManager?: EntityManager,
    preferUserId?: number,
  ): Promise<ResourceUsage | null> {
    return this.records.getActiveSession(resourceId, transactionalEntityManager, preferUserId);
  }

  /** All active sessions of one resource, earliest started first. */
  public async getActiveSessionsForResource(
    resourceId: number,
    transactionalEntityManager?: EntityManager,
  ): Promise<ResourceUsage[]> {
    return this.records.getActiveSessionsForResource(resourceId, transactionalEntityManager);
  }

  public async getActiveSessions(resourceIds: number[]): Promise<Map<number, ResourceUsage[]>> {
    return this.records.getActiveSessions(resourceIds);
  }

  public async getActiveSessionOverview(
    resourceId: number,
    userId: number,
  ): Promise<{
    usage: ResourceUsage | null;
    usages: ResourceUsage[];
    activeSessionCount: number;
    maxParallelSessions: number;
    isFull: boolean;
  }> {
    return this.records.getActiveSessionOverview(resourceId, userId);
  }

  /**
   * Opens a session for a viewer. Allowed: their own, any when `canViewAll`, and project-linked ones for members of
   * that project (as on main, whatever their activity access). Otherwise `redact` gives the view they may have, or
   * the session does not exist for them: always a 404, so nothing tells a hidden session from a missing one.
   */
  async getSessionDetails(
    resourceId: number,
    usageId: number,
    user: AuthenticatedUser,
    canViewAll = false,
    redact?: (usage: ResourceUsage) => ResourceUsage,
  ): Promise<ResourceUsage> {
    return this.records.getSessionDetails(resourceId, usageId, user, canViewAll, redact);
  }

  async getResourceUsageHistory(
    resourceId: number,
    page = 1,
    limit = 10,
    userId?: number,
  ): Promise<{ data: ResourceUsage[]; total: number }> {
    return this.records.getResourceUsageHistory(resourceId, page, limit, userId);
  }

  async updateSessionProject(
    resourceId: number,
    usageId: number,
    user: User,
    dto: UpdateUsageSessionProjectDto,
  ): Promise<ResourceUsage> {
    return this.records.updateSessionProject(resourceId, usageId, user, dto);
  }

  async lockDoor(resourceId: number, user: User): Promise<ResourceUsage> {
    return this.doors.lockDoor(resourceId, user);
  }

  async unlockDoor(resourceId: number, user: User): Promise<ResourceUsage> {
    return this.doors.unlockDoor(resourceId, user);
  }

  async unlatchDoor(resourceId: number, user: User): Promise<ResourceUsage> {
    return this.doors.unlatchDoor(resourceId, user);
  }

  /**
   * Read-only can-start precheck (ATT-1187): raises the refusals a start would raise, except balance, flows and
   * form handling. Plugin pre-start hooks only run for users who pass it.
   */
  async precheckStart(
    resourceId: number,
    user: User,
    dto: { forceTakeOver?: boolean },
    supervisorUserId: number | null = null,
  ): Promise<void> {
    return this.preparation.precheckStart(resourceId, user, dto, supervisorUserId);
  }

  async startSession(
    resourceId: number,
    user: User,
    dto: StartUsageSessionDto,
    options: StartSessionOptions = {},
  ): Promise<ResourceUsage> {
    return this.starts.startSession(resourceId, user, dto, options);
  }

  async endSession(
    resourceId: number,
    user: User,
    dto: EndUsageSessionDto,
    options: EndSessionOptions = {},
  ): Promise<ResourceUsage> {
    return this.ends.endSession(resourceId, user, dto, options);
  }

  /**
   * Called by the flow end-session node from within a start or stop flow; fails now if a user has no session.
   * The sessions are picked now, so the session being started is never among them.
   */
  async deferSessionEnds(
    attemptId: string,
    resourceId: number,
    target: SessionEndTarget,
    notes: string,
    manager?: EntityManager,
    triggeredByUserId?: number,
  ): Promise<void> {
    return this.ends.deferSessionEnds(attemptId, resourceId, target, notes, manager, triggeredByUserId);
  }

  /** Ends the sessions a flow names. Sessions that are already being ended are skipped. */
  async endSessionsOfTarget(
    resourceId: number,
    target: SessionEndTarget,
    notes: string,
    manager?: EntityManager,
    triggeredByUserId?: number,
  ): Promise<void> {
    return this.ends.endSessionsOfTarget(resourceId, target, notes, manager, triggeredByUserId);
  }

  /** A flow may end the tentative session it was started for before it becomes visible. */
  async cancelLifecycleCandidate(attemptId: string, resourceId: number): Promise<void> {
    return this.lifecycle.cancelLifecycleCandidate(attemptId, resourceId);
  }

  /**
   * Claim and discard the candidate before dispatching stopped-flow effects. `actorUserId` is the user whose start
   * or takeover this was; its stop flow runs on their behalf.
   */
  async endLifecycleCandidate(
    attemptId: string,
    resourceId: number,
    endNotes: string,
    actorUserId?: number,
  ): Promise<void> {
    return this.lifecycle.endLifecycleCandidate(attemptId, resourceId, endNotes, actorUserId);
  }

  /** Billing flow effects belong to the attempt until the entire lifecycle succeeds. */
  async stageLifecycleBillingItem(
    attemptId: string,
    resourceId: number,
    usageId: number | undefined,
    item: Omit<LifecycleBillingItem, 'usageId'>,
  ): Promise<void> {
    return this.lifecycle.stageLifecycleBillingItem(attemptId, resourceId, usageId, item);
  }

  /** Aborts the lifecycle attempts no running API instance works on any more (see {@link UsageLifecycle}). */
  public async recoverInterruptedLifecycles(sweep = false): Promise<void> {
    return this.lifecycle.recoverInterruptedLifecycles(sweep);
  }

  public async validateSupervisedStart(
    resourceId: number,
    requester: User,
    supervisorUserId: number,
    transactionalEntityManager?: EntityManager,
    preloadedResource?: Resource,
  ): Promise<void> {
    return this.gate.validateSupervisedStart(
      resourceId,
      requester,
      supervisorUserId,
      transactionalEntityManager,
      preloadedResource,
    );
  }

  public async assertSupportsSupervision(
    resourceId: number,
    transactionalEntityManager?: EntityManager,
    preloadedResource?: Resource,
  ): Promise<Resource> {
    return this.gate.assertSupportsSupervision(resourceId, transactionalEntityManager, preloadedResource);
  }

  public async canControllResource(
    resourceId: number,
    user: User,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    return this.access.canControllResource(resourceId, user, transactionalEntityManager);
  }

  // The access cache listens to these events itself; the handlers stay callable here as before.
  handleIntroductionChanged(): void {
    this.access.handleIntroductionChanged();
  }

  handleGroupIntroductionChanged(): void {
    this.access.handleGroupIntroductionChanged();
  }

  handleGroupIntroducerChanged(): void {
    this.access.handleGroupIntroducerChanged();
  }

  handleIntroducerChanged(event: ResourceIntroducerChangedEvent): void {
    this.access.handleIntroducerChanged(event);
  }

  handleResourceChanged(event: ResourceChangedEvent): void {
    this.access.handleResourceChanged(event);
  }

  handleUserPermissionsChanged(event: UserPermissionsChangedEvent): void {
    this.access.handleUserPermissionsChanged(event);
  }
}
