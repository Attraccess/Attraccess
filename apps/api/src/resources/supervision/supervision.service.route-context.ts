import { ResourceUsage, User } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { StartUsageSessionDto } from '../usage/dtos/startUsageSession.dto';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { RequestSupervisedSessionDto } from './dtos/requestSupervisedSession.dto';
import { SupervisionLiveEventType } from './dtos/supervisionLiveEvent.dto';
import { SupervisionRequestDto } from './dtos/supervisionRequest.dto';
import { SupervisionLiveService } from './supervision-live.service';
import {
  PendingSupervisionRequest,
  ReaderSupervisionArmer,
  ReaderSupervisionCallbacks,
} from './supervision.service.feature-definitions';

export abstract class SupervisionServiceRouteContext {
  protected abstract requestFromSupervisor(
    resourceId: number,
    requester: User,
    dto: RequestSupervisedSessionDto,
    supervisorUserId: number,
  ): Promise<ResourceUsage>;
  protected abstract requestAtReader(
    resourceId: number,
    requester: User,
    dto: RequestSupervisedSessionDto,
    readerId: number,
  ): Promise<ResourceUsage>;
  protected abstract readonly resourceUsageService: ResourceUsageService;
  protected abstract createPending(params: {
    id?: string;
    resourceId: number;
    requester: User;
    dto: StartUsageSessionDto;
    supervisorUserId: number | null;
    eligibleSupervisorIds: number[];
    readerCallbacks?: ReaderSupervisionCallbacks;
    readerId?: number;
  }): { id: string; expiresAt: Date; promise: Promise<ResourceUsage> };
  protected abstract readonly logger: Logger;
  protected abstract emitRequested(requestId: string): void;
  protected abstract readerArmer: ReaderSupervisionArmer | null;
  public abstract getEligibleSupervisorIds(resourceId: number, requesterId: number): Promise<number[]>;
  protected abstract readonly pending: Map<string, PendingSupervisionRequest>;
  protected abstract clear(request: PendingSupervisionRequest): void;
  protected abstract fail(request: PendingSupervisionRequest, error: Error): void;
  protected abstract readonly resourceIntroducersService: ResourceIntroducersService;
  protected abstract expire(requestId: string): void;
  protected abstract readonly supervisionLive: SupervisionLiveService;
  protected abstract toDto(request: PendingSupervisionRequest, recipientSupervisorId: number): SupervisionRequestDto;
  protected abstract emitToEligible(request: PendingSupervisionRequest, type: SupervisionLiveEventType): void;
  protected abstract getPendingForSupervisorOrThrow(
    requestId: string,
    supervisor: User,
    opts?: { allowAnyAuthorized?: boolean },
  ): PendingSupervisionRequest;
  protected abstract assertMayApprove(request: PendingSupervisionRequest, supervisor: User): Promise<void>;
  protected abstract fulfil(request: PendingSupervisionRequest, session: ResourceUsage): void;
  protected abstract readonly audit: AuditService;
}
