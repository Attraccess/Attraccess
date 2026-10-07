import { NFCCard, User } from '@attraccess/database-entities';
import { DeleteResult } from 'typeorm';
import { NotificationCategory } from '../notifications/notification-types';
import { t } from './attractap.service.route-context';
import { AttractapServiceRouteContext } from './attractap.service.route-context';
export abstract class AttractapCardStorageImplementation extends AttractapServiceRouteContext {
  protected notifyNfcCardChange(
    card: NFCCard | undefined,
    action: 'registered' | 'activated' | 'deactivated' | 'deleted',
  ): void {
    if (!card?.user) {
      return;
    }

    void this.notifications
      .dispatch({
        category: NotificationCategory.NFC_CARDS,
        recipients: [card.user],
        title: (recipient) => t(recipient.locale, `${action}Title`),
        body: (recipient) => t(recipient.locale, `${action}Body`, { cardId: card.id }),
        url: '/attractap/nfc-cards',
        dedupeKey: `nfc-card-${card.id}-${action}`,
      })
      .catch((error) => {
        this.logger.error(
          `Failed to notify user ${card.user.id} about RFID card ${action}: ${(error as Error).message}`,
        );
      });
  }

  public async getNFCCardByID(id: number): Promise<NFCCard | undefined> {
    const card = await this.nfcCardRepository.findOne({ where: { id }, relations: ['user'] });
    return this.decryptCardKey(card);
  }

  public async getNFCCardsByUserId(userId: number): Promise<NFCCard[]> {
    const cards = await this.nfcCardRepository.find({ where: { user: { id: userId } } });
    cards.forEach((card) => this.decryptCardKey(card));
    return cards;
  }

  public async getAllNFCCards(): Promise<NFCCard[]> {
    const cards = await this.nfcCardRepository.find();
    cards.forEach((card) => this.decryptCardKey(card));
    return cards;
  }

  public async getNFCCardByUID(uid: string): Promise<NFCCard | undefined> {
    const card = await this.nfcCardRepository.findOne({ where: { uid }, relations: ['user'] });
    return this.decryptCardKey(card);
  }

  public async createNFCCard(
    user: User,
    data: Omit<NFCCard, 'id' | 'createdAt' | 'updatedAt' | 'user' | 'lastSeen' | 'isActive'>,
  ): Promise<NFCCard> {
    const card = await this.nfcCardRepository.manager.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.update(NFCCard, { user }, { isActive: false });

      return await transactionalEntityManager.save(NFCCard, {
        ...data,
        key: this.encryptionService.encrypt(data.key),
        user,
        isActive: true,
      });
    });
    this.notifyNfcCardChange(card, 'registered');
    return card;
  }

  /**
   * Activates an RFID card (deactivates all other cards for the same user)
   * @param id The ID of the RFID card to activate
   * @returns The activated RFID card
   */
  public async activateNFCCard(id: number): Promise<NFCCard> {
    const card = await this.nfcCardRepository.manager.transaction(async (transactionalEntityManager) => {
      const card = await transactionalEntityManager.findOne(NFCCard, { where: { id }, relations: ['user'] });

      if (!card) {
        throw new Error(`Card with ID ${id} not found`);
      }

      await transactionalEntityManager
        .createQueryBuilder()
        .update(NFCCard)
        .set({ isActive: false })
        .where({ user: { id: card.user.id } })
        .execute();

      return await transactionalEntityManager.save(NFCCard, {
        ...card,
        isActive: true,
      });
    });
    this.notifyNfcCardChange(card, 'activated');
    return card;
  }

  /**
   * Deactivates an RFID card
   * @param id The ID of the RFID card to deactivate
   * @returns The deactivated RFID card
   */
  public async deactivateNFCCard(id: number): Promise<NFCCard> {
    await this.nfcCardRepository.update(id, { isActive: false });
    const card = await this.getNFCCardByID(id);
    this.notifyNfcCardChange(card, 'deactivated');
    return card;
  }

  public async deleteNFCCard(id: number): Promise<DeleteResult> {
    const card = await this.getNFCCardByID(id);
    const result = await this.nfcCardRepository.delete(id);
    this.notifyNfcCardChange(card, 'deleted');
    return result;
  }

  public async updateNFCCardLastSeen(uid: string): Promise<null | true> {
    const card = await this.getNFCCardByUID(uid);

    if (!card) {
      return null;
    }

    await this.nfcCardRepository.update(card.id, { lastSeen: new Date() });
    return true;
  }

  /**
   * Decrypts card key in place for use in the app. Assumes stored values are
   * already encrypted (see migration EncryptSensitiveData).
   */
  protected decryptCardKey(card?: NFCCard | null): NFCCard | undefined {
    if (!card?.key) {
      return card ?? undefined;
    }
    card.key = this.encryptionService.decryptIfEncrypted(card.key) ?? card.key;
    return card;
  }
}
