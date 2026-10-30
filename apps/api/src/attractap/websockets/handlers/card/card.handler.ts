import { getSupportedDeviceLanguage } from '@attraccess/shared';
import { Resource, SupervisionMode } from '@attraccess/database-entities';

import { SettingsService } from '../../../../settings/settings.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MetricsService } from '../../../../metrics/metrics.service';

import { ResourceIntroducersService } from '../../../../resources/introducers/resourceIntroducers.service';

import { ResourceUsageService } from '../../../../resources/usage/sessions/resource-usage.service';

import { RbacService } from '../../../../users-and-auth/rbac/rbac.service';

import { UsersService } from '../../../../users-and-auth/users/users.service';

import { AttractapService } from '../../../attractap.service';

import { CardOperationsService } from '../../card-operations.service';
import { CardWriterPolicyService } from '../../card-writer-policy.service';
import { WebsocketService } from '../../websocket.service';

import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../../websocket.types';

import { ResourceListService } from '../resource-list/resource-list.service';

@Injectable()
export class AttractapCardHandler {
  protected readonly logger = new Logger(AttractapCardHandler.name);

  @Inject(SettingsService)
  protected settingsService: SettingsService;

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

  @Inject(CardOperationsService)
  protected cardOperations: CardOperationsService;

  @Inject(CardWriterPolicyService)
  protected cardWriterPolicy: CardWriterPolicyService;

  @Inject(ResourceListService)
  protected resourceListService: ResourceListService;

  /**
   * A card was tapped for a login. The user becomes the connection's verified user only after the
   * server authenticated the card with the stored key; a UID alone gets nothing.
   */
  public async handleCardTap(socket: AuthenticatedWebSocket, uid: string, resourceId: number) {
    this.metricsService.attractapNfcTapsTotal.inc({ reader_id: String(socket.readerId) });
    const reply = (payload: Record<string, unknown>) =>
      socket.sendMessage(new AttractapEvent(AttractapEventType.CARD_AUTHENTICATION_DATA, payload));

    const verified = await this.cardOperations.verifyCard(socket, 'tap', uid);
    if (!verified.ok) {
      await reply({ error: verified.error });
      return;
    }
    const nfcCard = verified.card;

    socket.state.verifiedUserId = nfcCard.user.id;
    socket.state.verifiedCardUid = uid;

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

    await reply({
      username: nfcCard.user.username,
      language: await this.settingsService.resolveLanguage(nfcCard.user.locale),
      languageFallback: !getSupportedDeviceLanguage(nfcCard.user.locale),
      canManageResource: (await this.rbacService.getEffectivePermissions(nfcCard.user.id)).has('resources.update'),
      hasIntroduction,
      isIntroducer,
      supervisionMode,
      requiresSupervisor,
    });
    // Supplemental list queries must neither delay nor prevent physical card
    // verification. The reader keeps actions disabled until access arrives.
    void this.resourceListService.sendResourceListToSocket(socket).catch((error) => {
      this.logger.error(`Failed to refresh resources after card authentication for reader ${socket.readerId}`, error);
    });
  }

  /** The reader's login ended (logout or timeout): the server forgets who was logged in. */
  public onReaderSessionEnded(socket: AuthenticatedWebSocket) {
    this.clearVerifiedUser(socket);
  }

  public clearVerifiedUser(socket: AuthenticatedWebSocket) {
    socket.state.verifiedUserId = null;
    socket.state.verifiedCardUid = null;
  }

  public async startResetOfNfcCard(data: {
    readerId: number;
    userId: number;
    cardId: number;
    authenticationMethod?: 'session' | 'api-token';
    apiTokenId?: number;
  }) {
    const reader = await this.attractapService.findReaderById(data.readerId);

    if (!reader) {
      throw new Error(`Reader not found: ${data.readerId}`);
    }
    await this.cardWriterPolicy.assertAllowed(data.readerId);

    const user = await this.usersService.findOne({ id: data.userId });

    if (!user) {
      throw new Error(`User not found: ${data.userId}`);
    }

    const socket = Array.from(this.websocketService.sockets.values()).find(
      (socket) => socket.readerId === data.readerId,
    );

    if (!socket) {
      throw new Error(`Reader not connected: ${data.readerId}`);
    }
    if (!socket.state.cardRelay) {
      throw new Error(`Reader firmware must be updated to reset cards: ${data.readerId}`);
    }
    const nfcCard = await this.attractapService.getNFCCardByID(data.cardId);

    if (!nfcCard) {
      throw new Error(`NFC card not found: ${data.cardId}`);
    }
    if (socket.state.enrollment || socket.state.resetNfcCardData || socket.state.massIntroductionFlow) {
      throw new Error(`Reader already has an active card operation: ${data.readerId}`);
    }

    // The reader only learns who the card belongs to. The key stays on the server: the next card
    // presented here is reset by the server, and the record is dropped once the card confirmed it.
    socket.state.resetNfcCardData = {
      cardId: nfcCard.id,
      auditPrincipal: {
        userId: user.id,
        authenticationMethod: data.authenticationMethod ?? 'session',
        ...(data.authenticationMethod === 'api-token' ? { apiTokenId: data.apiTokenId } : {}),
      },
    };
    const reset = socket.state.resetNfcCardData;

    try {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.RESET_NFC_CARD, { username: nfcCard.user.username }),
      );
    } catch (error) {
      if (socket.state.resetNfcCardData === reset) socket.state.resetNfcCardData = null;
      this.logger.debug(`Failed to send RESET_NFC_CARD to client ${socket.id}: ${String(error)}`);
      throw error;
    }
  }

  /** A card was presented to a reader that is waiting to reset one. */
  public async handleResetCard(socket: AuthenticatedWebSocket, uid: string) {
    const reset = socket.state.resetNfcCardData;
    if (!reset) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.RESET_NFC_CARD, { error: 'RESET_NFC_CARD_DATA_NOT_SET' }),
      );
      return;
    }

    const outcome = await this.cardOperations.reset(socket, uid, reset);
    if (socket.state.resetNfcCardData !== reset) return;
    if (!outcome.ok) {
      // The reader stays on its screen and may retry with the same card within the timeout.
      this.logger.warn(`Reset of NFC card failed: ${outcome.error}`);
      await socket.sendMessage(new AttractapEvent(AttractapEventType.RESET_NFC_CARD, { error: outcome.error }));
      return;
    }
    socket.state.resetNfcCardData = null;
    await socket.sendMessage(new AttractapEvent(AttractapEventType.RESET_NFC_CARD, { success: true }));
  }

  // Reader actively cancelled (user pressed cancel) or the reset timed out.
  public async onResetNfcCardCancel(socket: AuthenticatedWebSocket) {
    this.logger.log('Reset of NFC card cancelled by reader');
    socket.state.resetNfcCardData = null;
  }

  public async startEnrollOfNewNfcCard(data: {
    readerId: number;
    userId: number;
    actorId?: number;
    authenticationMethod?: 'session' | 'api-token';
    apiTokenId?: number;
  }) {
    const reader = await this.attractapService.findReaderById(data.readerId);

    if (!reader) {
      throw new Error(`Reader not found: ${data.readerId}`);
    }

    if (!reader.firmware.capabilities.cardEnrollment) {
      throw new Error(`Reader does not support card enrollment: ${data.readerId}`);
    }
    await this.cardWriterPolicy.assertAllowed(data.readerId);

    const user = await this.usersService.findOne({ id: data.userId });

    if (!user) {
      throw new Error(`User not found: ${data.userId}`);
    }

    const sockets = Array.from(this.websocketService.sockets.values()).filter(
      (socket) => socket.readerId === data.readerId,
    );

    if (sockets.length === 0) {
      throw new Error(`Reader not connected: ${data.readerId}`);
    }
    if (sockets.some((socket) => !socket.state.cardRelay)) {
      throw new Error(`Reader firmware must be updated to enroll cards: ${data.readerId}`);
    }
    if (
      sockets.some(
        (socket) => socket.state.enrollment || socket.state.resetNfcCardData || socket.state.massIntroductionFlow,
      )
    ) {
      throw new Error(`Reader already has an active card operation: ${data.readerId}`);
    }

    // Send to all active sockets for this reader to avoid targeting a stale/disconnecting socket
    const tasks = sockets.map(async (socket) => {
      const authenticationMethod = data.authenticationMethod ?? 'session';
      socket.state.enrollment = {
        userId: user.id,
        auditPrincipal: {
          userId: data.actorId ?? user.id,
          authenticationMethod,
          ...(authenticationMethod === 'api-token' ? { apiTokenId: data.apiTokenId } : {}),
        },
      };
      const enrollment = socket.state.enrollment;
      try {
        const delivered = await socket.sendMessage(
          new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO, {
            username: user.username,
          }),
        );
        if (!delivered && socket.state.enrollment === enrollment) socket.state.enrollment = null;
      } catch (error) {
        if (socket.state.enrollment === enrollment) socket.state.enrollment = null;
        // Log and continue; other sockets may still deliver the event
        this.logger.debug(
          `Failed to send ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO to client ${socket.id}: ${String(error)}`,
        );
      }
    });

    await Promise.allSettled(tasks);
  }

  /** A card was presented to a reader that is waiting to enroll one. The server writes and proves the key. */
  public async handleEnrollCard(socket: AuthenticatedWebSocket, uid: string) {
    const enrollment = socket.state.enrollment;
    if (!enrollment) {
      await socket.sendMessage(new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { error: 'USER_NOT_SET' }));
      return;
    }

    const outcome = await this.cardOperations.enroll(socket, uid, enrollment);
    if (socket.state.enrollment !== enrollment) return;
    if (!outcome.ok) {
      // The enrollment stays armed: the reader may present the card again within the same session.
      this.logger.warn(`Enroll new card failed: ${outcome.error}`);
      await socket.sendMessage(new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { error: outcome.error }));
      return;
    }
    socket.state.enrollment = null;
    await socket.sendMessage(new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { success: true }));
  }

  // Reader actively cancelled (user pressed cancel) or the enrollment timed out.
  public async onEnrollNewCardCancel(socket: AuthenticatedWebSocket) {
    this.logger.log('Enroll new card cancelled by reader');
    socket.state.enrollment = null;
  }
}
