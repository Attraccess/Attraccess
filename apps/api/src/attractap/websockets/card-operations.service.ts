import { NFCCard, NFCCardPendingChange, User } from '@attraccess/database-entities';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { EncryptionService } from '../../encryption/encryption.service';
import { UsersService } from '../../users-and-auth/users/users.service';
import {
  CardChannel,
  CardKind,
  FACTORY_KEY,
  KEY_VERSION_ENROLLED,
  KEY_VERSION_FREE,
  authenticate,
  changeKeyAndVerify,
  detectCardKind,
  findFreeKeyNo,
} from '../card-crypto/card-operations';
import { AttractapService } from '../attractap.service';
import { CardConversationFailure, CardConversationService } from './card-conversation.service';
import { AuthenticatedWebSocket } from './websocket.types';

export type AuditPrincipal = { userId: number; authenticationMethod: 'session' | 'api-token'; apiTokenId?: number };

export type CardOutcome<T = unknown> = { ok: boolean; error?: string } & Partial<T>;

/** Error codes the reader shows; conversation failures keep their own name. */
const conversationError = (reason: CardConversationFailure): string =>
  ({
    BUSY: 'BUSY',
    CARD_REMOVED: 'CARD_REMOVED',
    TIMEOUT: 'CARD_TIMEOUT',
    TOO_MANY_EXCHANGES: 'CARD_TIMEOUT',
    READER_UNREACHABLE: 'CARD_REMOVED',
    READER_SESSION_ENDED: 'CARD_REMOVED',
  })[reason];

/**
 * Every card check of the system. The reader relays APDUs; keys, session state and the decision
 * whether a card is genuine stay here. Nothing is reported as done before the card proved it.
 */
@Injectable()
export class CardOperationsService {
  private readonly logger = new Logger(CardOperationsService.name);

  @Inject(AttractapService)
  private readonly attractapService: AttractapService;

  @Inject(CardConversationService)
  private readonly conversations: CardConversationService;

  @Inject(EncryptionService)
  private readonly encryption: EncryptionService;

  @Inject(UsersService)
  private readonly usersService: UsersService;

  @Inject(AuditService)
  private readonly audit: AuditService;

  @InjectRepository(NFCCardPendingChange)
  private readonly pendingRepository: Repository<NFCCardPendingChange>;

  private pendingKey(change: NFCCardPendingChange): Buffer | null {
    if (!change.key) return null;
    const plain = this.encryption.decryptIfEncrypted(change.key) ?? change.key;
    return /^[0-9a-f]{32}$/i.test(plain) ? Buffer.from(plain, 'hex') : null;
  }

  private cardKey(card: NFCCard): Buffer | null {
    return /^[0-9a-f]{32}$/i.test(card.key) ? Buffer.from(card.key, 'hex') : null;
  }

  /**
   * Proves that the card on this reader holds the key stored for its UID. Used by every flow that
   * grants something to a card holder (taps, supervisor cards, mass introduction). It finishes an
   * interrupted enrollment or reset it finds on the card instead of failing.
   */
  async verifyCard(
    socket: AuthenticatedWebSocket,
    purpose: 'tap' | 'supervisor' | 'mass-introduction',
    uid: string,
  ): Promise<CardOutcome<{ card: NFCCard }>> {
    const card = await this.attractapService.getNFCCardByUID(uid);
    const pendingEnroll = card ? null : await this.pendingRepository.findOne({ where: { uid, kind: 'enroll' } });
    if (!card && !pendingEnroll) return { ok: false, error: 'CARD_NOT_FOUND' };
    if (card && !card.isActive) return { ok: false, error: 'CARD_NOT_ACTIVE' };
    const pendingReset = card
      ? await this.pendingRepository.findOne({ where: { uid, kind: 'reset', cardId: card.id } })
      : null;

    const result = await this.conversations.run<CardOutcome<{ card: NFCCard }>>(
      socket,
      purpose,
      uid,
      async (channel) => {
        const detected = await detectCardKind(channel);
        if (!detected.ok) return { ok: false, error: 'CARD_NOT_SUPPORTED' };
        const kind = detected.kind;

        if (card) {
          const key = this.cardKey(card);
          if (key && (await authenticate(channel, kind, card.keyNo, key))) {
            if (pendingReset) await this.pendingRepository.delete(pendingReset.id);
            return { ok: true, card };
          }
          if (pendingReset && (await authenticate(channel, kind, card.keyNo, FACTORY_KEY))) {
            await this.finishReset(card.id, uid, null);
            return { ok: false, error: 'CARD_NOT_FOUND' };
          }
          return { ok: false, error: 'CARD_AUTHENTICATION_FAILED' };
        }

        const recovered = await this.finishPendingEnroll(channel, kind, pendingEnroll!);
        return recovered ? { ok: true, card: recovered } : { ok: false, error: 'CARD_NOT_FOUND' };
      },
    );
    if (!result.ok) return { ok: false, error: conversationError(result.reason) };
    return result.value;
  }

  /** The card holds the key an earlier, interrupted enrollment was writing: record the card now. */
  private async finishPendingEnroll(
    channel: CardChannel,
    kind: CardKind,
    pending: NFCCardPendingChange,
  ): Promise<NFCCard | null> {
    const key = this.pendingKey(pending);
    if (!key || pending.userId == null) return null;
    if (!(await authenticate(channel, kind, pending.keyNo, key))) return null;
    const user = await this.usersService.findOne({ id: pending.userId });
    if (!user) return null;
    return this.recordEnrollment(user, channel.uid, pending, key.toString('hex'), 'reader-recovery');
  }

  private async recordEnrollment(
    user: User,
    uid: string,
    pending: NFCCardPendingChange,
    keyHex: string,
    source: string,
    auditPrincipal?: AuditPrincipal,
  ): Promise<NFCCard> {
    const card = await this.attractapService.createNFCCard(user, { key: keyHex, keyNo: pending.keyNo, uid });
    await this.pendingRepository.delete(pending.id);
    await this.audit
      .recordAttractap({
        action: 'card.linked',
        actorId: auditPrincipal?.userId ?? pending.actorId ?? user.id,
        authenticationMethod: auditPrincipal?.authenticationMethod ?? 'session',
        ...(auditPrincipal?.authenticationMethod === 'api-token' ? { apiTokenId: auditPrincipal.apiTokenId } : {}),
        subjectId: card.id,
        details: { source },
      })
      .catch(() => undefined);
    card.key = keyHex;
    return card;
  }

  /** Enrollment: find a free slot, write a fresh random key and prove it before recording the card. */
  async enroll(
    socket: AuthenticatedWebSocket,
    uid: string,
    enrollment: { userId: number; auditPrincipal: AuditPrincipal },
  ): Promise<CardOutcome> {
    if (await this.attractapService.getNFCCardByUID(uid)) return { ok: false, error: 'CARD_ALREADY_ENROLLED' };
    const user = await this.usersService.findOne({ id: enrollment.userId });
    if (!user) return { ok: false, error: 'USER_NOT_FOUND' };

    const result = await this.conversations.run<CardOutcome>(socket, 'enroll', uid, async (channel) => {
      const detected = await detectCardKind(channel);
      if (!detected.ok) return { ok: false, error: 'CARD_NOT_SUPPORTED' };
      const kind = detected.kind;

      // An earlier attempt for this card may have reached the card although nobody heard back.
      const stale = await this.pendingRepository.find({ where: { uid, kind: 'enroll' } });
      for (const change of stale) {
        const key = this.pendingKey(change);
        if (key && change.userId === user.id && (await authenticate(channel, kind, change.keyNo, key))) {
          await this.recordEnrollment(
            user,
            uid,
            change,
            key.toString('hex'),
            'reader-enrollment',
            enrollment.auditPrincipal,
          );
          return { ok: true };
        }
      }
      if (stale.length) await this.pendingRepository.delete(stale.map((change) => change.id));

      const keyNo = await findFreeKeyNo(channel, kind);
      if (keyNo == null) return { ok: false, error: 'NO_FREE_KEY_SLOT' };

      const keyHex = this.attractapService.generateCardKey();
      // Written before the first byte reaches the card so an interruption can be finished later.
      const pending = await this.pendingRepository.save({
        uid,
        kind: 'enroll',
        userId: user.id,
        cardId: null,
        keyNo,
        key: this.encryption.encrypt(keyHex),
        actorId: enrollment.auditPrincipal.userId,
      });

      const outcome = await changeKeyAndVerify(
        channel,
        kind,
        keyNo,
        FACTORY_KEY,
        FACTORY_KEY,
        Buffer.from(keyHex, 'hex'),
        KEY_VERSION_ENROLLED,
      );
      if (outcome !== 'done') {
        return { ok: false, error: outcome === 'master-refused' ? 'CARD_NOT_FACTORY' : 'ENROLL_NOT_CONFIRMED' };
      }
      await this.recordEnrollment(user, uid, pending, keyHex, 'reader-enrollment', enrollment.auditPrincipal);
      return { ok: true };
    });
    if (!result.ok) return { ok: false, error: conversationError(result.reason) };
    return result.value;
  }

  /** Reset: write the factory key back and prove it; only then the card record is removed. */
  async reset(
    socket: AuthenticatedWebSocket,
    uid: string,
    reset: { cardId: number; auditPrincipal: AuditPrincipal },
  ): Promise<CardOutcome> {
    const card = await this.attractapService.getNFCCardByID(reset.cardId);
    if (!card) return { ok: false, error: 'CARD_NOT_FOUND' };
    if (card.uid !== uid) return { ok: false, error: 'WRONG_CARD' };
    const storedKey = this.cardKey(card);
    if (!storedKey) return { ok: false, error: 'CARD_KEY_UNAVAILABLE' };

    const result = await this.conversations.run<CardOutcome>(socket, 'reset', uid, async (channel) => {
      const detected = await detectCardKind(channel);
      if (!detected.ok) return { ok: false, error: 'CARD_NOT_SUPPORTED' };
      const kind = detected.kind;

      // Already at the factory key: an earlier attempt got through. Nothing left to write.
      if (!(await authenticate(channel, kind, card.keyNo, FACTORY_KEY))) {
        await this.pendingRepository.save({
          uid,
          kind: 'reset',
          userId: null,
          cardId: card.id,
          keyNo: card.keyNo,
          key: null,
          actorId: reset.auditPrincipal.userId,
        });
        const outcome = await changeKeyAndVerify(
          channel,
          kind,
          card.keyNo,
          FACTORY_KEY,
          storedKey,
          FACTORY_KEY,
          KEY_VERSION_FREE,
        );
        if (outcome !== 'done') {
          return { ok: false, error: outcome === 'master-refused' ? 'CARD_MASTER_KEY_UNKNOWN' : 'RESET_NOT_CONFIRMED' };
        }
      }
      await this.finishReset(card.id, uid, reset.auditPrincipal, socket.readerId);
      return { ok: true };
    });
    if (!result.ok) return { ok: false, error: conversationError(result.reason) };
    return result.value;
  }

  private async finishReset(
    cardId: number,
    uid: string,
    auditPrincipal: AuditPrincipal | null,
    readerId?: number | null,
  ): Promise<void> {
    const deleted = await this.attractapService.deleteNFCCard(cardId);
    await this.pendingRepository.delete({ uid, kind: 'reset' });
    if (deleted.affected && auditPrincipal) {
      await this.audit
        .recordAttractap({
          action: 'card.unlinked',
          actorId: auditPrincipal.userId,
          authenticationMethod: auditPrincipal.authenticationMethod,
          ...(auditPrincipal.authenticationMethod === 'api-token' ? { apiTokenId: auditPrincipal.apiTokenId } : {}),
          subjectId: cardId,
          details: { readerId, source: 'reader-reset' },
        })
        .catch(() => undefined);
    }
  }
}
