import { Inject, Injectable, Logger } from '@nestjs/common';
import { subtle, pbkdf2Sync } from 'crypto';
import { NFCCard, Attractap, Resource, User } from '@attraccess/database-entities';
import { DeleteResult, FindManyOptions, In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { nanoid } from 'nanoid';
import { securelyHashToken } from './websockets/websocket.utils';
import { ReaderUpdatedEvent } from './events';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AttractapFirmwareVersion } from '@attraccess/database-entities';

@Injectable()
export class AttractapService {
  private readonly logger = new Logger(AttractapService.name);

  public constructor(
    @InjectRepository(NFCCard)
    private readonly nfcCardRepository: Repository<NFCCard>,
    @InjectRepository(Attractap)
    private readonly readerRepository: Repository<Attractap>,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>
  ) {}

  public async getNFCCardByID(id: number): Promise<NFCCard | undefined> {
    return await this.nfcCardRepository.findOne({ where: { id }, relations: ['user'] });
  }

  public async getNFCCardsByUserId(userId: number): Promise<NFCCard[]> {
    return await this.nfcCardRepository.find({ where: { user: { id: userId } } });
  }

  public async getAllNFCCards(): Promise<NFCCard[]> {
    return await this.nfcCardRepository.find();
  }

  public async updateLastReaderConnection(id: number) {
    return await this.readerRepository.update(id, { lastConnection: new Date() });
  }

  public async findReaderById(id: number): Promise<Attractap | undefined> {
    return await this.readerRepository.findOne({ where: { id }, relations: ['resources'] });
  }

  public async getNFCCardByUID(uid: string): Promise<NFCCard | undefined> {
    return await this.nfcCardRepository.findOne({ where: { uid }, relations: ['user'] });
  }

  public async createNFCCard(
    user: User,
    data: Omit<NFCCard, 'id' | 'createdAt' | 'updatedAt' | 'user' | 'lastSeen' | 'isActive'>
  ): Promise<NFCCard> {
    return await this.nfcCardRepository.manager.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.update(NFCCard, { user }, { isActive: false });

      return await transactionalEntityManager.save(NFCCard, {
        ...data,
        user,
        isActive: true,
      });
    });
  }

  /**
   * Activates an NFC card (deactivates all other cards for the same user)
   * @param id The ID of the NFC card to activate
   * @returns The activated NFC card
   */
  public async activateNFCCard(id: number): Promise<NFCCard> {
    return await this.nfcCardRepository.manager.transaction(async (transactionalEntityManager) => {
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
  }

  /**
   * Deactivates an NFC card
   * @param id The ID of the NFC card to deactivate
   * @returns The deactivated NFC card
   */
  public async deactivateNFCCard(id: number): Promise<NFCCard> {
    await this.nfcCardRepository.update(id, { isActive: false });
    return await this.getNFCCardByID(id);
  }

  public async deleteNFCCard(id: number): Promise<DeleteResult> {
    return await this.nfcCardRepository.delete(id);
  }

  public async updateNFCCardLastSeen(uid: string): Promise<null | true> {
    const card = await this.getNFCCardByUID(uid);

    if (!card) {
      return null;
    }

    await this.nfcCardRepository.update(card.id, { lastSeen: new Date() });
    return true;
  }

  public async createNewReader(firmware?: AttractapFirmwareVersion): Promise<{ reader: Attractap; token: string }> {
    const token = nanoid(16);
    const apiTokenHash = await securelyHashToken(token);

    const reader = await this.readerRepository.save({
      apiTokenHash,
      name: nanoid(4),
      firmware,
    });

    return {
      reader,
      token,
    };
  }

  public async updateReader(
    id: number,
    updateData: { name?: string; connectedResourceIds?: number[]; firmware?: AttractapFirmwareVersion },
    emitEvent = true
  ): Promise<Attractap> {
    const reader = await this.findReaderById(id);

    if (!reader) {
      throw new Error(`Reader with ID ${id} not found`);
    }

    if (updateData.name) {
      reader.name = updateData.name;
    }

    if (updateData.firmware) {
      this.logger.debug('Updating reader firmware info', updateData.firmware);
      reader.firmware = updateData.firmware;
    }

    this.logger.debug('updateData', updateData);
    if (updateData.connectedResourceIds) {
      this.logger.debug('attaching resources to reader', updateData.connectedResourceIds);
      let resources: Resource[] = [];
      if (updateData.connectedResourceIds.length > 0) {
        resources = await this.resourceRepository.find({
          where: {
            id: In(updateData.connectedResourceIds),
          },
        });

        this.logger.debug('resources from db', resources);
      }

      this.logger.debug('resources for reader', resources);
      reader.resources = resources;
    }

    const response = await this.readerRepository.save(reader);

    if (emitEvent) {
      this.eventEmitter.emit(ReaderUpdatedEvent.EVENT_NAME, new ReaderUpdatedEvent(response));
    }

    return response;
  }

  /**
   * Updates the firmware version and type for a reader
   * @param id The reader ID
   * @param firmwareVersion The firmware version
   * @param firmwareType The firmware type
   * @returns Promise<Attractap>
   */
  public async updateReaderFirmware(id: number, firmware: AttractapFirmwareVersion) {
    await this.updateReader(id, { firmware }, false);
  }

  public async getAllReaders(options?: FindManyOptions<Attractap>): Promise<Attractap[]> {
    return await this.readerRepository.find(options);
  }

  public uint8ArrayToHexString(uint8Array: Uint8Array) {
    return Array.from(uint8Array)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Generates a new key for the NFC card using PBKDF2 with salt and iterations for enhanced security.
   * The key derivation is based on:
   * - A unique random token per user (stored in user.nfcKeySeedToken)
   * - The key number
   * - The card UID
   * - A deterministic salt derived from the card UID and key number
   * - 100,000 iterations for PBKDF2
   * @param keyNo The key number to generate
   * @param cardUID The UID of the NFC card
   * @param userId The ID of the user who owns the card
   * @returns 16 bytes Uint8Array
   */
  public async generateNTAG424Key(data: { keyNo: number; cardUID: string; userId: number }) {
    const user = await this.userRepository.findOne({ where: { id: data.userId } });

    if (!user) {
      this.logger.error(`User with ID ${data.userId} not found`);
      throw new Error(`User with ID ${data.userId} not found`);
    }

    // Generate a secure token if it doesn't exist
    if (!user.nfcKeySeedToken) {
      user.nfcKeySeedToken = nanoid(32); // 32 characters = ~192 bits of entropy
      await this.userRepository.save(user);
    }

    // Create a secure seed using the user's unique token, key number, and card UID
    const seed = `${user.nfcKeySeedToken}:${data.keyNo}:${data.cardUID}`;

    // Create a deterministic salt from card UID and key number
    // This ensures the same card+key combination always produces the same salt
    const saltSeed = `${data.cardUID}:${data.keyNo}`;
    const saltBytes = new TextEncoder().encode(saltSeed);
    const salt = await subtle.digest('SHA-256', saltBytes);

    // Use PBKDF2 with 100,000 iterations for secure key derivation
    const iterations = 100000;
    const keyLength = 16; // 16 bytes = 128 bits

    const derivedKey = pbkdf2Sync(seed, new Uint8Array(salt), iterations, keyLength, 'sha256');

    // shrink to 16 bytes
    return new Uint8Array(derivedKey).slice(0, 16);
  }
}
