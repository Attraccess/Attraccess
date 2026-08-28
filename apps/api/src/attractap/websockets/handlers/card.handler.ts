import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource, SupervisionMode } from '@attraccess/database-entities';
import { WebsocketService } from '../websocket.service';
import { AttractapService } from '../../attractap.service';
import { UsersService } from '../../../users-and-auth/users/users.service';
import { ResourceUsageService } from '../../../resources/usage/resourceUsage.service';
import { ResourceIntroducersService } from '../../../resources/introducers/resourceIntroducers.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { RbacService } from '../../../users-and-auth/rbac/rbac.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../websocket.types';
import { ResourceListService } from './resource-list.service';

@Injectable()
export class AttractapCardHandler {
  private readonly logger = new Logger(AttractapCardHandler.name);

  @Inject(WebsocketService)
  private websocketService: WebsocketService;

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(UsersService)
  private usersService: UsersService;

  @Inject(ResourceUsageService)
  private resourceUsageService: ResourceUsageService;

  @Inject(ResourceIntroducersService)
  private resourceIntroducersService: ResourceIntroducersService;

  @Inject(MetricsService)
  private metricsService: MetricsService;

  @Inject(RbacService)
  private rbacService: RbacService;

  @InjectRepository(Resource)
  private resourceRepository: Repository<Resource>;

  @Inject(ResourceListService)
  private resourceListService: ResourceListService;

  public async startEnrollOfNewNfcCard(data: { readerId: number; userId: number }) {
    const reader = await this.attractapService.findReaderById(data.readerId);

    if (!reader) {
      throw new Error(`Reader not found: ${data.readerId}`);
    }

    if (!reader.firmware.capabilities.cardEnrollment) {
      throw new Error(`Reader does not support card enrollment: ${data.readerId}`);
    }

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

    // Send to all active sockets for this reader to avoid targeting a stale/disconnecting socket
    const tasks = sockets.map(async (socket) => {
      socket.state.lastAuthenticatedUserId = user.id;
      try {
        await socket.sendMessage(
          new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO, {
            username: user.username,
          }),
        );
      } catch (error) {
        // Log and continue; other sockets may still deliver the event
        this.logger.debug(
          `Failed to send ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO to client ${socket.id}: ${String(error)}`,
        );
      }
    });

    await Promise.allSettled(tasks);
  }

  public async onEnrollNewCardRequestNFCKey(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { uid, keyNo } = data.payload as { uid: string; keyNo: number };

    if (!socket.state.lastAuthenticatedUserId) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY, { error: 'USER_NOT_SET' }),
      );
      return;
    }

    if (!uid || typeof uid !== 'string' || !keyNo || typeof keyNo !== 'number') {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY, { error: 'INVALID_PARAMS' }),
      );
      return;
    }

    const existingCard = await this.attractapService.getNFCCardByUID(uid);
    if (existingCard) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY, { error: 'CARD_ALREADY_ENROLLED' }),
      );
      return;
    }

    const key = await this.attractapService.generateNTAG424Key({
      userId: socket.state.lastAuthenticatedUserId,
      keyNo,
      cardUID: uid,
    });

    const keyString = this.attractapService.uint8ArrayToHexString(key);

    socket.state.enrollNewCardData = {
      keyNo,
      key: keyString,
      cardUID: uid,
    };
    await socket.sendMessage(new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { key: keyString, keyNo }));
  }

  public async onEnrollNewCard(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    if (!socket.state.enrollNewCardData) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { error: 'ENROLL_NEW_CARD_DATA_NOT_SET' }),
      );
      return;
    }

    const { success } = data.payload as { success: boolean };
    if (!success) {
      // The card write failed on the reader. Drop the stale key material so a
      // retry requests a fresh key, but keep lastAuthenticatedUserId so the
      // reader can re-attempt within the same enrollment session.
      this.logger.error('Enroll new card failed');
      socket.state.enrollNewCardData = null;
      return;
    }

    const { key, keyNo, cardUID } = socket.state.enrollNewCardData;

    if (!key || typeof key !== 'string' || !keyNo || typeof keyNo !== 'number') {
      await socket.sendMessage(new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { error: 'KEY_NOT_SET' }));
      return;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await socket.sendMessage(new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { error: 'USER_NOT_FOUND' }));
      return;
    }

    await this.attractapService.createNFCCard(user, {
      key,
      keyNo,
      uid: cardUID,
    });

    socket.state.enrollNewCardData = null;
    socket.state.lastAuthenticatedUserId = null;
    socket.sendMessage(new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { success: true }));
  }

  // Reader actively cancelled (user pressed cancel) or the enrollment timed out.
  // Clear all enrollment state so a stale key/user can't leak into a later flow.
  public async onEnrollNewCardCancel(socket: AuthenticatedWebSocket) {
    this.logger.log('Enroll new card cancelled by reader');
    socket.state.enrollNewCardData = null;
    socket.state.lastAuthenticatedUserId = null;
  }

  public async startResetOfNfcCard(data: { readerId: number; userId: number; cardId: number }) {
    const reader = await this.attractapService.findReaderById(data.readerId);

    if (!reader) {
      throw new Error(`Reader not found: ${data.readerId}`);
    }

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

    const nfcCard = await this.attractapService.getNFCCardByID(data.cardId);

    if (!nfcCard) {
      throw new Error(`NFC card not found: ${data.cardId}`);
    }

    // Hand the reader everything it needs to reset the card in one go: the
    // stored key + slot let it authenticate the card and write the factory key
    // back, so — unlike enrollment — no extra key round-trip is required. The
    // cardId is kept in socket state so we know which DB record to delete once
    // the reader confirms the on-card reset succeeded.
    socket.state.resetNfcCardData = {
      cardId: nfcCard.id,
      key: nfcCard.key,
      keyNo: nfcCard.keyNo,
    };

    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.RESET_NFC_CARD, {
        username: nfcCard.user.username,
        keyNo: nfcCard.keyNo,
        key: nfcCard.key,
      }),
    );
  }

  public async onResetNfcCard(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    if (!socket.state.resetNfcCardData) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.RESET_NFC_CARD, { error: 'RESET_NFC_CARD_DATA_NOT_SET' }),
      );
      return;
    }

    const { success } = data.payload as { success: boolean };
    if (!success) {
      this.logger.error('Reset of NFC card failed on reader');
      // Keep the reset data: the reader stays on its screen and may retry the
      // write with the same card within the timeout.
      return;
    }

    const { cardId } = socket.state.resetNfcCardData;

    // The card was wiped back to the factory key on the reader; drop the DB
    // record so the (now blank) card is no longer recognised.
    await this.attractapService.deleteNFCCard(cardId);

    socket.state.resetNfcCardData = null;
    socket.sendMessage(new AttractapEvent(AttractapEventType.RESET_NFC_CARD, { success: true }));
  }

  // Reader actively cancelled (user pressed cancel) or the reset timed out.
  // Clear the reset state so a stale cardId can't leak into a later flow.
  public async onResetNfcCardCancel(socket: AuthenticatedWebSocket) {
    this.logger.log('Reset of NFC card cancelled by reader');
    socket.state.resetNfcCardData = null;
  }

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

    // The list is personalized after each card tap so row actions use the
    // selected resource's authorization instead of the authentication resource.
    await this.resourceListService.sendResourceListToSocket(socket);

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
  }
}
