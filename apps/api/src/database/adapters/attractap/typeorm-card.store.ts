import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NFCCard, NFCCardPendingChange, User } from '@attraccess/database-entities';
import type {
  AttractapCardOwner,
  AttractapNfcCard,
  AttractapNfcCardPendingChange,
  NewAttractapNfcCard,
  NewAttractapNfcCardPendingChange,
} from '@attraccess/application-models';
import { EntityManager, Repository } from 'typeorm';
import { type AttractapCardStore, CardAlreadyEnrolledError } from '../../../attractap/card-store.port';
import { isUniqueViolation } from '../../persistence-errors';
import { toCardOwner, toNfcCard, toPendingChange } from './attractap-mappers';

/**
 * Activating a card deactivates the owner's other cards first. The owner's row is locked (FOR NO KEY UPDATE) for the
 * rest of the transaction, so two overlapping activations take turns and never leave two active cards. The no-key
 * variant leaves the FOR KEY SHARE locks of inserts referencing the user (sessions, bills) unblocked.
 */
async function lockCardOwner(manager: EntityManager, userId: number): Promise<void> {
  await manager
    .createQueryBuilder(User, 'user')
    .select('user.id')
    .where('user.id = :userId', { userId })
    .setLock('for_no_key_update')
    .getOne();
}

/** The unique index on `lower(uid)` (migration NfcCardUniqueUid1796500000000): one card record per UID. */
export const NFC_CARD_UID_INDEX = 'UQ_nfc_card_uid_lower';

/** True only when the unique index on the card UID rejected the write; other violations are not this one. */
function isDuplicateUid(error: unknown): boolean {
  if (!isUniqueViolation(error)) return false;
  const constraint =
    (error as { driverError?: { constraint?: unknown } }).driverError?.constraint ??
    (error as { constraint?: unknown }).constraint;
  return constraint === NFC_CARD_UID_INDEX;
}

@Injectable()
export class TypeOrmAttractapCardStore implements AttractapCardStore {
  constructor(
    @InjectRepository(NFCCard) private readonly cards: Repository<NFCCard>,
    @InjectRepository(NFCCardPendingChange) private readonly pending: Repository<NFCCardPendingChange>,
  ) {}

  async findById(id: number): Promise<AttractapNfcCard | undefined> {
    const card = await this.cards.findOne({ where: { id }, relations: { user: true } });
    return card ? toNfcCard(card) : undefined;
  }

  async findByUid(uid: string): Promise<AttractapNfcCard | undefined> {
    // One normalised form: a record stored in upper case still matches what a reader or plugin sends.
    const card = await this.cards
      .createQueryBuilder('card')
      .leftJoinAndSelect('card.user', 'user')
      .where('LOWER(card.uid) = :uid', { uid: uid.toLowerCase() })
      .getOne();
    return card ? toNfcCard(card) : undefined;
  }

  async listForUser(userId: number): Promise<AttractapNfcCard[]> {
    return (await this.cards.find({ where: { user: { id: userId } } })).map(toNfcCard);
  }

  async listAll(): Promise<AttractapNfcCard[]> {
    return (await this.cards.find()).map(toNfcCard);
  }

  async userHasActiveCard(userId: number): Promise<boolean> {
    return (await this.cards.count({ where: { user: { id: userId }, isActive: true } })) > 0;
  }

  async create(owner: AttractapCardOwner, card: NewAttractapNfcCard, activate: boolean): Promise<AttractapNfcCard> {
    let saved: NFCCard;
    try {
      saved = await this.cards.manager.transaction(async (manager) => {
        if (activate) {
          await lockCardOwner(manager, owner.id);
          await manager.update(NFCCard, { user: { id: owner.id } }, { isActive: false });
        }
        return await manager.save(NFCCard, { ...card, user: { id: owner.id }, isActive: activate });
      });
    } catch (error) {
      // Another enrollment recorded the UID first. The rollback kept the owner's other cards as they were.
      if (isDuplicateUid(error)) throw new CardAlreadyEnrolledError();
      throw error;
    }
    // The owner the caller loaded is the user the notification of the new card is addressed to; it is
    // projected to the card owner fields so nothing else of the caller's user record leaves the store.
    return { ...toNfcCard(saved), user: toCardOwner(owner) };
  }

  async activateExclusively(id: number): Promise<AttractapNfcCard> {
    const saved = await this.cards.manager.transaction(async (manager) => {
      const owner = await manager.findOne(NFCCard, { where: { id }, relations: { user: true } });
      if (!owner) throw new Error(`Card with ID ${id} not found`);
      await lockCardOwner(manager, owner.user.id);
      // Read again under the lock: a card the owner changed meanwhile is saved as it is now.
      const card = await manager.findOne(NFCCard, { where: { id }, relations: { user: true } });
      if (!card) throw new Error(`Card with ID ${id} not found`);
      await manager
        .createQueryBuilder()
        .update(NFCCard)
        .set({ isActive: false })
        .where({ user: { id: card.user.id } })
        .execute();
      return await manager.save(NFCCard, { ...card, isActive: true });
    });
    return toNfcCard(saved as NFCCard);
  }

  async deactivate(id: number): Promise<void> {
    await this.cards.update(id, { isActive: false });
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.cards.delete(id);
    return Boolean(result.affected);
  }

  async recordSeen(id: number, at: Date): Promise<void> {
    await this.cards.update(id, { lastSeen: at });
  }

  async findPendingEnroll(uid: string): Promise<AttractapNfcCardPendingChange | null> {
    const change = await this.pending.findOne({ where: { uid, kind: 'enroll' } });
    return change ? toPendingChange(change) : null;
  }

  async listPendingEnrolls(uid: string): Promise<AttractapNfcCardPendingChange[]> {
    return (await this.pending.find({ where: { uid, kind: 'enroll' } })).map(toPendingChange);
  }

  async listPendingResets(uid: string): Promise<AttractapNfcCardPendingChange[]> {
    return (await this.pending.find({ where: { uid, kind: 'reset' } })).map(toPendingChange);
  }

  async savePending(change: NewAttractapNfcCardPendingChange): Promise<AttractapNfcCardPendingChange> {
    return toPendingChange((await this.pending.save({ ...change })) as NFCCardPendingChange);
  }

  async deletePendingById(ids: number | number[]): Promise<void> {
    await this.pending.delete(ids);
  }

  async deletePendingByUid(uid: string, kind: 'enroll' | 'reset'): Promise<void> {
    await this.pending.delete({ uid, kind });
  }
}
