import type {
  AttractapCardOwner,
  AttractapNfcCard,
  AttractapNfcCardPendingChange,
  NewAttractapNfcCard,
} from '@attraccess/application-models';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUDIT_RECORDER, AuditRecorder } from '../../audit/recorder/audit-event';
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
  sakSpeaksIsoDep,
} from '../card-crypto/card-operations';
import { isRandomUid, normalizeCardUid } from '../card-uid';
import { CardWriterPolicyService } from './card-writer-policy.service';
import { AttractapService } from '../attractap.service';
import { ATTRACTAP_CARD_STORE, type AttractapCardStore, CardAlreadyEnrolledError } from '../card-store.port';
import { CardConversationFailure, CardConversationService, PluginCardExchange } from './card-conversation.service';
import { AuthenticatedWebSocket, CardDetection } from './websocket.types';
import type { AuditAuthenticationMethod as AuthenticationMethod } from '@attraccess/application-models';
import type { PluginCardAuthenticationResult, PluginCardFailureReason } from '@attraccess/plugins-backend-sdk';

export type AuditPrincipal = {
  userId: number;
  authenticationMethod: AuthenticationMethod;
  apiTokenId?: number;
};

export type CardOutcome<T = unknown> = { ok: boolean; error?: string } & Partial<T>;

/** Where a card check runs: on a reader, or on a plugin's own device. */
type CardCheckOrigin = { readerId: number | null } | { pluginId: string };

/** Audit source of an interrupted enrollment or reset that a card check finished. */
type CardRecoverySource = 'reader-recovery' | 'plugin-recovery';

/** Where an audited card removal came from: a reader reset, a recovery, or the deletion of a UID-only card. */
type CardUnlinkSource = 'reader-reset' | CardRecoverySource | 'uid-only-delete';

const recoverySource = (origin: CardCheckOrigin): CardRecoverySource =>
  'pluginId' in origin ? 'plugin-recovery' : 'reader-recovery';

/** The card reasons a card check can end with. A check without one (a card without owner) counts as not found. */
const PLUGIN_CARD_REASONS: readonly PluginCardFailureReason[] = [
  'CARD_NOT_FOUND',
  'CARD_NOT_ACTIVE',
  'CARD_NOT_SUPPORTED',
  'CARD_AUTHENTICATION_FAILED',
];
/** A UID-only card on a plugin's device while the setting is off is a card the installation does not support. */
const pluginCardReason = (error: string | undefined): PluginCardFailureReason =>
  error === 'UID_ONLY_CARDS_DISABLED'
    ? 'CARD_NOT_SUPPORTED'
    : (PLUGIN_CARD_REASONS.find((reason) => reason === error) ?? 'CARD_NOT_FOUND');

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

  @Inject(AUDIT_RECORDER)
  private readonly audit: AuditRecorder;

  @Inject(ATTRACTAP_CARD_STORE)
  private readonly cardStore: AttractapCardStore;

  @Inject(CardWriterPolicyService)
  private readonly policy: CardWriterPolicyService;

  private pendingKey(change: AttractapNfcCardPendingChange): Buffer | null {
    if (!change.key) return null;
    const plain = this.encryption.decryptIfEncrypted(change.key) ?? change.key;
    return /^[0-9a-f]{32}$/i.test(plain) ? Buffer.from(plain, 'hex') : null;
  }

  private cardKey(card: AttractapNfcCard): Buffer | null {
    return card.key && /^[0-9a-f]{32}$/i.test(card.key) ? Buffer.from(card.key, 'hex') : null;
  }

  /**
   * Checks the card on this reader against the record for its UID. Used by every flow that grants something to a
   * card holder (taps, supervisor cards, mass introduction). A secure record needs proof of its key; it finishes an
   * interrupted enrollment or reset it finds on the card instead of failing. A UID-only record needs a reader that
   * reports the card's SAK and the setting that allows such cards.
   */
  async verifyCard(
    socket: AuthenticatedWebSocket,
    purpose: 'tap' | 'supervisor' | 'mass-introduction',
    detection: CardDetection,
  ): Promise<CardOutcome<{ card: AttractapNfcCard }>> {
    const verification = await this.prepareVerification(detection.uid, { readerId: socket.readerId }, detection.sak);
    if (typeof verification !== 'function') return verification;

    const result = await this.conversations.run<CardOutcome<{ card: AttractapNfcCard }>>(
      socket,
      purpose,
      detection,
      verification,
    );
    if (!result.ok) return { ok: false, error: conversationError(result.reason) };
    return result.value;
  }

  /**
   * The same check as `verifyCard`, for a card held to a plugin's own device. The plugin relays APDUs through
   * `exchange`; keys and session state stay here. Only the card's id, UID and owner reach the plugin. An
   * interrupted enrollment or reset is finished as at a reader, audited with the plugin id.
   */
  async verifyPluginCard(request: {
    pluginId: string;
    device: string;
    uid: unknown;
    exchange: PluginCardExchange;
    signal?: AbortSignal;
  }): Promise<PluginCardAuthenticationResult> {
    const { pluginId, device, exchange, signal } = request;
    const { uid: requestedUid } = request;
    // A new request ends the one running on the device before any check, as a new detection does on a reader.
    this.conversations.endPluginDevice({ pluginId, device });
    if (typeof requestedUid !== 'string' || !/^[0-9a-fA-F]{4,32}$/.test(requestedUid)) {
      return { ok: false, reason: 'INVALID_UID' };
    }
    const uid = normalizeCardUid(requestedUid);
    // Before any database work, as for reader detections.
    if (this.conversations.atLimit) return { ok: false, reason: 'BUSY' };

    const result = await this.conversations.runForPlugin<CardOutcome<{ card: AttractapNfcCard }>>(
      { pluginId, device },
      uid,
      exchange,
      signal,
      async (channel) => {
        const verification = await this.prepareVerification(uid, { pluginId });
        return typeof verification === 'function' ? verification(channel) : verification;
      },
    );
    if (!result.ok) return { ok: false, reason: result.reason };
    const { ok, error, card } = result.value;
    const userId = card?.user?.id;
    if (!ok || userId == null) return { ok: false, reason: pluginCardReason(error) };
    // Copied field by field: the entity carries the card key.
    return { ok: true, card: { id: card.id, uid: card.uid, userId } };
  }

  /**
   * Database lookups of a card check, then the card conversation itself. Resolves with an outcome when the check
   * is decided without the card, otherwise with the work to run over the card's channel.
   */
  private async prepareVerification(
    uid: string,
    origin: CardCheckOrigin,
    /** The card's SAK when the reader reports it; a plugin's request carries none. */
    sak?: number,
  ): Promise<
    | CardOutcome<{ card: AttractapNfcCard }>
    | ((channel: CardChannel) => Promise<CardOutcome<{ card: AttractapNfcCard }>>)
  > {
    const card = await this.attractapService.getNFCCardByUID(uid);
    const pendingEnroll = card ? null : await this.cardStore.findPendingEnroll(uid);
    if (!card && !pendingEnroll) return { ok: false, error: 'CARD_NOT_FOUND' };
    if (card && !card.isActive) return { ok: false, error: 'CARD_NOT_ACTIVE' };
    // The record decides how the tap is checked: a UID-only record needs nothing from the card but its UID,
    // and only while an administrator allows it. A secure record never does.
    if (card?.type === 'uid-only') {
      // A reader that reports no SAK runs firmware without UID-only support: it cannot tell such a card from a
      // secure one and does not watch it like one, so it keeps refusing it as before. Plugin requests carry no SAK.
      if (!('pluginId' in origin) && sak === undefined) return { ok: false, error: 'CARD_NOT_SUPPORTED' };
      return (await this.policy.isUidOnlyAllowed())
        ? { ok: true, card }
        : { ok: false, error: 'UID_ONLY_CARDS_DISABLED' };
    }
    // A card that cannot answer APDUs cannot prove a key (a cheap card carrying a copied UID).
    if (sak !== undefined && !sakSpeaksIsoDep(sak)) {
      return { ok: false, error: card ? 'CARD_AUTHENTICATION_FAILED' : 'CARD_NOT_FOUND' };
    }
    const pendingResets = card ? await this.cardStore.listPendingResets(uid) : [];
    const pendingReset = pendingResets.find((change) => change.cardId === card?.id) ?? null;

    return async (channel) => {
      const detected = await detectCardKind(channel);
      if (!detected.ok) return { ok: false, error: 'CARD_NOT_SUPPORTED' };
      const kind = detected.kind;

      if (card) {
        const key = this.cardKey(card);
        if (key && (await authenticate(channel, kind, card.keyNo, key))) {
          // The card still holds its key: no reset of it got through, so no record of one is needed.
          if (pendingResets.length) await this.cardStore.deletePendingByUid(uid, 'reset');
          return { ok: true, card };
        }
        if (pendingReset && (await authenticate(channel, kind, card.keyNo, FACTORY_KEY))) {
          const actorId = pendingReset.actorId ?? card.user?.id ?? null;
          await this.unlinkCard(
            card.id,
            uid,
            actorId == null ? null : { userId: actorId, authenticationMethod: 'session' },
            recoverySource(origin),
            'readerId' in origin ? origin.readerId : null,
            'pluginId' in origin ? origin.pluginId : undefined,
          );
          return { ok: false, error: 'CARD_NOT_FOUND' };
        }
        return { ok: false, error: 'CARD_AUTHENTICATION_FAILED' };
      }

      const recovered = pendingEnroll ? await this.finishPendingEnroll(channel, kind, pendingEnroll, origin) : null;
      if (!recovered) return { ok: false, error: 'CARD_NOT_FOUND' };
      return recovered.isActive ? { ok: true, card: recovered } : { ok: false, error: 'CARD_NOT_ACTIVE' };
    };
  }

  /**
   * The card holds the key an earlier, interrupted enrollment was writing: record the card now. Null when it cannot
   * be recorded, also when another check or enrollment recorded the UID at the same moment: that tap answers
   * `CARD_NOT_FOUND`, and the next one (once the card was lifted) verifies against the recorded card.
   */
  private async finishPendingEnroll(
    channel: CardChannel,
    kind: CardKind,
    pending: AttractapNfcCardPendingChange,
    origin: CardCheckOrigin,
  ): Promise<AttractapNfcCard | null> {
    const key = this.pendingKey(pending);
    if (!key || pending.userId == null) return null;
    if (!(await authenticate(channel, kind, pending.keyNo, key))) return null;
    const user = await this.usersService.findOne({ id: pending.userId });
    if (!user) return null;
    // The user may have enrolled another card since: record this one, but don't switch that one off.
    const activate = !(await this.attractapService.userHasActiveNFCCard(user.id));
    return this.recordEnrollment(
      user,
      channel.uid,
      pending,
      key.toString('hex'),
      recoverySource(origin),
      undefined,
      activate,
      'pluginId' in origin ? { pluginId: origin.pluginId } : undefined,
    );
  }

  /**
   * Records the card the enrollment `pending` wrote its key to. Null when another record got the UID first (the
   * unique index decides a race the lookup before cannot): nothing is audited and `pending` is deleted, as the UID
   * belongs to that record now (removing it removes the UID's pending enrollments too). Its key stays in the card slot.
   */
  private async recordEnrollment(
    user: AttractapCardOwner,
    uid: string,
    pending: AttractapNfcCardPendingChange,
    keyHex: string,
    source: string,
    auditPrincipal?: AuditPrincipal,
    activate = true,
    origin?: { pluginId: string },
  ): Promise<AttractapNfcCard | null> {
    const card = await this.createCard(user, { key: keyHex, keyNo: pending.keyNo, uid }, activate);
    await this.cardStore.deletePendingById(pending.id);
    if (!card) return null;
    // This UID now belongs to this card record: no other enrollment may be recovered onto it later (e.g. after a
    // reset). Records for other UIDs stay; their key may be on another card.
    await this.cardStore.deletePendingByUid(uid, 'enroll');
    await this.audit.record({
      domain: 'attractap',
      action: 'attractap.card.linked',
      actor: {
        id: auditPrincipal?.userId ?? pending.actorId ?? user.id,
        authenticationMethod: auditPrincipal?.authenticationMethod ?? 'session',
        ...(auditPrincipal?.authenticationMethod === 'api-token' ? { apiTokenId: auditPrincipal.apiTokenId } : {}),
      },
      subject: { type: 'attractap.card', id: card.id },
      details: origin ? { source, pluginId: origin.pluginId } : { source },
    });
    card.key = keyHex;
    return card;
  }

  /** Enrollment: find a free slot, write a fresh random key and prove it before recording the card. */
  async enroll(
    socket: AuthenticatedWebSocket,
    detection: CardDetection,
    enrollment: { userId: number; auditPrincipal: AuditPrincipal },
  ): Promise<CardOutcome> {
    const { uid, sak } = detection;
    if (await this.attractapService.getNFCCardByUID(uid)) return { ok: false, error: 'CARD_ALREADY_ENROLLED' };
    const user = await this.usersService.findOne({ id: enrollment.userId });
    if (!user) return { ok: false, error: 'USER_NOT_FOUND' };

    // A card that does not speak ISO 14443-4 has nothing to talk to: no conversation is needed (or possible).
    if (sak !== undefined && !sakSpeaksIsoDep(sak)) return this.enrollUidOnly(user, uid, enrollment);

    const result = await this.conversations.run<CardOutcome>(socket, 'enroll', detection, async (channel) => {
      const detected = await detectCardKind(channel);
      if (!detected.ok) {
        // Only a card that is known not to do AES (a DESFire EV1) falls back, and only on a reader that reports
        // the SAK; a secure card that fails never does.
        return sak !== undefined
          ? this.enrollUidOnly(user, uid, enrollment)
          : { ok: false, error: 'CARD_NOT_SUPPORTED' };
      }
      const kind = detected.kind;

      // An earlier attempt for this card may have reached the card although nobody heard back.
      const stale = await this.cardStore.listPendingEnrolls(uid);
      for (const change of stale) {
        const key = this.pendingKey(change);
        if (key && change.userId === user.id && (await authenticate(channel, kind, change.keyNo, key))) {
          const recorded = await this.recordEnrollment(
            user,
            uid,
            change,
            key.toString('hex'),
            'reader-enrollment',
            enrollment.auditPrincipal,
          );
          return recorded ? { ok: true } : { ok: false, error: 'CARD_ALREADY_ENROLLED' };
        }
      }
      // This user's records were not for this card. Other users' records stay: their key may be on
      // this card (an interrupted enrollment for them), and only their record can recover it.
      const ownStale = stale.filter((change) => change.userId === user.id);
      if (ownStale.length) await this.cardStore.deletePendingById(ownStale.map((change) => change.id));

      const keyNo = await findFreeKeyNo(channel, kind);
      if (keyNo == null) return { ok: false, error: 'NO_FREE_KEY_SLOT' };

      const keyHex = this.attractapService.generateCardKey();
      let pending: AttractapNfcCardPendingChange | null = null;
      const outcome = await changeKeyAndVerify(
        channel,
        kind,
        keyNo,
        FACTORY_KEY,
        FACTORY_KEY,
        Buffer.from(keyHex, 'hex'),
        KEY_VERSION_ENROLLED,
        undefined,
        {
          // Saved once the card accepted the master key, right before the key write, so an
          // interruption from here on can be finished later. A refused login leaves no record.
          beforeWrite: async () => {
            pending = await this.cardStore.savePending({
              uid,
              kind: 'enroll',
              userId: user.id,
              cardId: null,
              keyNo,
              key: this.encryption.encrypt(keyHex),
              actorId: enrollment.auditPrincipal.userId,
            });
          },
        },
      );
      if (outcome === 'master-refused') return { ok: false, error: 'CARD_NOT_FACTORY' };
      if (outcome !== 'done' || !pending) return { ok: false, error: 'ENROLL_NOT_CONFIRMED' };
      const recorded = await this.recordEnrollment(
        user,
        uid,
        pending,
        keyHex,
        'reader-enrollment',
        enrollment.auditPrincipal,
      );
      return recorded ? { ok: true } : { ok: false, error: 'CARD_ALREADY_ENROLLED' };
    });
    if (!result.ok) return { ok: false, error: conversationError(result.reason) };
    return result.value;
  }

  /**
   * Enrollment of a card that cannot do AES: only its UID is recorded, nothing is written to the card.
   * Needs the setting, read now (it may have changed since the enrollment was armed).
   */
  private async enrollUidOnly(
    user: AttractapCardOwner,
    uid: string,
    enrollment: { auditPrincipal: AuditPrincipal },
  ): Promise<CardOutcome> {
    if (!(await this.policy.isUidOnlyAllowed())) return { ok: false, error: 'CARD_NOT_SUPPORTED' };
    if (isRandomUid(uid)) return { ok: false, error: 'RANDOM_UID_NOT_SUPPORTED' };
    // An interrupted secure enrollment wrote a key to a card with this UID: that card exists and is secure, so a
    // card without AES showing the same UID is a copy. Its record must stay, so the secure card can still be recovered.
    if ((await this.cardStore.listPendingEnrolls(uid)).length) return { ok: false, error: 'CARD_ALREADY_ENROLLED' };
    const { auditPrincipal } = enrollment;
    const card = await this.createCard(user, { uid, type: 'uid-only', keyNo: null, key: null }, true);
    if (!card) return { ok: false, error: 'CARD_ALREADY_ENROLLED' };
    await this.audit.record({
      domain: 'attractap',
      action: 'attractap.card.linked',
      actor: {
        id: auditPrincipal.userId,
        authenticationMethod: auditPrincipal.authenticationMethod,
        ...(auditPrincipal.authenticationMethod === 'api-token' ? { apiTokenId: auditPrincipal.apiTokenId } : {}),
      },
      subject: { type: 'attractap.card', id: card.id },
      details: { source: 'reader-enrollment', cardType: 'uid-only' },
    });
    return { ok: true };
  }

  /** Stores a new card record; null when another record holds the UID already (in any letter case). */
  private async createCard(
    user: AttractapCardOwner,
    data: NewAttractapNfcCard,
    activate: boolean,
  ): Promise<AttractapNfcCard | null> {
    try {
      return await this.attractapService.createNFCCard(user, data, { activate });
    } catch (error) {
      if (error instanceof CardAlreadyEnrolledError) return null;
      throw error;
    }
  }

  /**
   * Removes a UID-only card: nothing is written to such a card, so no reader is needed. A secure card is refused
   * (`CARD_NOT_UID_ONLY`); its key must be reset through a reader. `CARD_NOT_FOUND` when it is already gone.
   */
  async deleteUidOnlyCard(card: AttractapNfcCard, auditPrincipal: AuditPrincipal): Promise<CardOutcome> {
    if (card.type !== 'uid-only') return { ok: false, error: 'CARD_NOT_UID_ONLY' };
    const deleted = await this.unlinkCard(card.id, card.uid, auditPrincipal, 'uid-only-delete');
    return deleted ? { ok: true } : { ok: false, error: 'CARD_NOT_FOUND' };
  }

  /** Reset: write the factory key back and prove it; only then the card record is removed. */
  async reset(
    socket: AuthenticatedWebSocket,
    detection: CardDetection,
    reset: { cardId: number; auditPrincipal: AuditPrincipal },
  ): Promise<CardOutcome> {
    const { uid } = detection;
    const card = await this.attractapService.getNFCCardByID(reset.cardId);
    if (!card) return { ok: false, error: 'CARD_NOT_FOUND' };
    if (normalizeCardUid(card.uid) !== uid) return { ok: false, error: 'WRONG_CARD' };
    // Nothing is written to a UID-only card; its record is deleted without a reader.
    if (card.type === 'uid-only') return { ok: false, error: 'CARD_IS_UID_ONLY' };
    const storedKey = this.cardKey(card);
    if (!storedKey) return { ok: false, error: 'CARD_KEY_UNAVAILABLE' };

    const result = await this.conversations.run<CardOutcome>(socket, 'reset', detection, async (channel) => {
      const detected = await detectCardKind(channel);
      if (!detected.ok) return { ok: false, error: 'CARD_NOT_SUPPORTED' };
      const kind = detected.kind;

      // Already at the factory key: an earlier attempt got through. Nothing left to write.
      if (!(await authenticate(channel, kind, card.keyNo, FACTORY_KEY))) {
        const outcome = await changeKeyAndVerify(
          channel,
          kind,
          card.keyNo,
          FACTORY_KEY,
          storedKey,
          FACTORY_KEY,
          KEY_VERSION_FREE,
          undefined,
          {
            // Saved once the card accepted the master key, right before the key write. One record
            // per card: an earlier attempt's record is replaced, not duplicated.
            beforeWrite: async () => {
              await this.cardStore.deletePendingByUid(uid, 'reset');
              await this.cardStore.savePending({
                uid,
                kind: 'reset',
                userId: null,
                cardId: card.id,
                keyNo: card.keyNo,
                key: null,
                actorId: reset.auditPrincipal.userId,
              });
            },
          },
        );
        if (outcome === 'master-refused') return { ok: false, error: 'CARD_MASTER_KEY_UNKNOWN' };
        if (outcome !== 'done') return { ok: false, error: 'RESET_NOT_CONFIRMED' };
      }
      await this.unlinkCard(card.id, uid, reset.auditPrincipal, 'reader-reset', socket.readerId);
      return { ok: true };
    });
    if (!result.ok) return { ok: false, error: conversationError(result.reason) };
    return result.value;
  }

  /** Removes a card record with its pending changes and audits the removal. */
  private async unlinkCard(
    cardId: number,
    uid: string,
    auditPrincipal: AuditPrincipal | null,
    source: CardUnlinkSource,
    readerId?: number | null,
    /** Set instead of `readerId` when the card was on a plugin's device. */
    pluginId?: string,
  ): Promise<boolean> {
    const deleted = await this.attractapService.deleteNFCCard(cardId);
    await this.cardStore.deletePendingByUid(uid, 'reset');
    // A reset card must not come back as someone's card from an older interrupted enrollment.
    await this.cardStore.deletePendingByUid(uid, 'enroll');
    if (deleted && auditPrincipal) {
      await this.audit.record({
        domain: 'attractap',
        action: 'attractap.card.unlinked',
        actor: {
          id: auditPrincipal.userId,
          authenticationMethod: auditPrincipal.authenticationMethod,
          ...(auditPrincipal.authenticationMethod === 'api-token' ? { apiTokenId: auditPrincipal.apiTokenId } : {}),
        },
        subject: { type: 'attractap.card', id: cardId },
        details: pluginId ? { pluginId, source } : source === 'uid-only-delete' ? { source } : { readerId, source },
      });
    }
    return deleted;
  }
}
