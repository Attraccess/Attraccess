import { Resource, SupervisionMode } from '@attraccess/database-entities';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../../../audit/audit.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { ResourceIntroducersService } from '../../../resources/introducers/resourceIntroducers.service';
import { ResourceUsageService } from '../../../resources/usage/resourceUsage.service';
import { RbacService } from '../../../users-and-auth/rbac/rbac.service';
import { UsersService } from '../../../users-and-auth/users/users.service';
import { AttractapService } from '../../attractap.service';
import { WebsocketService } from '../websocket.service';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../websocket.types';
import { CardResetImplementation } from './card-reset';
import { ResourceListService } from './resource-list.service';

@Injectable()
export class AttractapCardHandler extends CardResetImplementation {
  protected readonly logger = new Logger(AttractapCardHandler.name);

  @Inject(WebsocketService)
  protected websocketService: WebsocketService;

  @Inject(AttractapService)
  protected attractapService: AttractapService;

  @Inject(UsersService)
  protected usersService: UsersService;

  @Inject(ResourceUsageService)
  protected resourceUsageService: ResourceUsageService;

  @Inject(ResourceIntroducersService)
  protected resourceIntroducersService: ResourceIntroducersService;

  @Inject(MetricsService)
  protected metricsService: MetricsService;

  @Inject(RbacService)
  protected rbacService: RbacService;

  @InjectRepository(Resource)
  protected resourceRepository: Repository<Resource>;

  @Inject(AuditService)
  protected audit: AuditService;

  @Inject(ResourceListService)
  protected resourceListService: ResourceListService;
  // Reader actively cancelled (user pressed cancel) or the enrollment timed out.
  // Clear all enrollment state so a stale key/user can't leak into a later flow.
  // Reader actively cancelled (user pressed cancel) or the reset timed out.
  // Clear the reset state so a stale cardId can't leak into a later flow.

  public async handleCardAuthenticationRequest(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    this.metricsService.attractapNfcTapsTotal.inc({ reader_id: String(socket.readerId) });
    const { uid, resourceId } = data.payload as { uid: string; resourceId: number };

    if (!uid || typeof uid !== 'string') {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.CARD_AUTHENTICATION_DATA, {
          error: 'INVALID_UID',
        }),
      );
      return;
    }

    const nfcCard = await this.attractapService.getNFCCardByUID(uid);

    if (!nfcCard) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.CARD_AUTHENTICATION_DATA, {
          error: 'CARD_NOT_FOUND',
        }),
      );
      return;
    }

    if (!nfcCard.isActive) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.CARD_AUTHENTICATION_DATA, {
          error: 'CARD_NOT_ACTIVE',
        }),
      );
      return;
    }

    socket.state.lastAuthenticatedUserId = nfcCard.user.id;

    const hasIntroduction = await this.resourceUsageService.canControllResource(resourceId, nfcCard.user);
    const isIntroducer = await this.resourceIntroducersService.isIntroducer(resourceId, nfcCard.user.id, true);

    const resource = await this.resourceRepository.findOne({ where: { id: resourceId } });
    const supervisionMode = resource?.supervisionMode ?? SupervisionMode.INTRODUCTION_REQUIRED;

    // Whether this tap must be authorised by a supervisor before a session can start (ATT-493):
    // - SUPERVISION_REQUIRED: always, even for introduced users (mirrors the solo-start guard).
    // - SUPERVISION_ALLOWED: only when the user is not (yet) introduced.
    // INTRODUCTION_REQUIRED never allows a supervised start, so the reader falls back to its
    // existing "no introduction" handling.
    const requiresSupervisor =
      supervisionMode === SupervisionMode.SUPERVISION_REQUIRED ||
      (supervisionMode === SupervisionMode.SUPERVISION_ALLOWED && !hasIntroduction);

    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.CARD_AUTHENTICATION_DATA, {
        keyNo: nfcCard.keyNo,
        key: nfcCard.key,
        username: nfcCard.user.username,
        canManageResource: (await this.rbacService.getEffectivePermissions(nfcCard.user.id)).has('resources.update'),
        hasIntroduction,
        isIntroducer,
        supervisionMode,
        requiresSupervisor,
      }),
    );
    // Supplemental list queries must neither delay nor prevent physical card
    // verification. The reader keeps actions disabled until access arrives.
    void this.resourceListService.sendResourceListToSocket(socket).catch((error) => {
      this.logger.error(`Failed to refresh resources after card authentication for reader ${socket.readerId}`, error);
    });
  }
}
