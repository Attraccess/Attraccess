import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NFCCard, NFCCardPendingChange } from '@attraccess/database-entities';
import type {
  AttractapCardOwner,
  AttractapNfcCard,
  AttractapNfcCardPendingChange,
  NewAttractapNfcCard,
  NewAttractapNfcCardPendingChange,
} from '@attraccess/application-models';
import { Repository } from 'typeorm';
import type { AttractapCardStore } from '../../../attractap/card-store.port';
import { toCardOwner, toNfcCard, toPendingChange } from './attractap-mappers';

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
    const card = await this.cards.findOne({ where: { uid }, relations: { user: true } });
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
    const saved = await this.cards.manager.transaction(async (manager) => {
      if (activate) await manager.update(NFCCard, { user: { id: owner.id } }, { isActive: false });
      return await manager.save(NFCCard, { ...card, user: { id: owner.id }, isActive: activate });
    });
    // The owner the caller loaded is the user the notification of the new card is addressed to; it is
    // projected to the card owner fields so nothing else of the caller's user record leaves the store.
    return { ...toNfcCard(saved as NFCCard), user: toCardOwner(owner) };
  }

  async activateExclusively(id: number): Promise<AttractapNfcCard> {
    const saved = await this.cards.manager.transaction(async (manager) => {
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
