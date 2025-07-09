import { Inject, Injectable, Logger } from '@nestjs/common';
import { subtle } from 'crypto';
import { NFCCard, Attractap } from '@attraccess/database-entities';
import { DeleteResult, FindManyOptions, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { nanoid } from 'nanoid';
import { securelyHashToken } from './modules/websockets/websocket.utils';
import { ReaderUpdatedEvent } from './events';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AttractapService {
  private readonly logger = new Logger(AttractapService.name);

  public constructor(
    @InjectRepository(NFCCard)
    private readonly nfcCardRepository: Repository<NFCCard>,
    @InjectRepository(Attractap)
    private readonly readerRepository: Repository<Attractap>,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2
  ) {}

  public async getNFCCardByID(id: number): Promise<NFCCard | undefined> {
    return await this.nfcCardRepository.findOne({ where: { id } });
  }

  public async getNFCCardsByUserId(userId: number): Promise<NFCCard[]> {
    return await this.nfcCardRepository.find({ where: { userId } });
  }

  public async getAllNFCCards(): Promise<NFCCard[]> {
    return await this.nfcCardRepository.find();
  }

  public async updateLastReaderConnection(id: number) {
    return await this.readerRepository.update(id, { lastConnection: new Date() });
  }

  public async findReaderById(id: number): Promise<Attractap | undefined> {
    return await this.readerRepository.findOne({ where: { id } });
  }

  public async getNFCCardByUID(uid: string): Promise<NFCCard | undefined> {
    return await this.nfcCardRepository.findOne({ where: { uid } });
  }

  public async createNFCCard(data: Omit<NFCCard, 'id' | 'createdAt' | 'updatedAt'>): Promise<NFCCard> {
    return await this.nfcCardRepository.save(data);
  }

  public async deleteNFCCard(id: number): Promise<DeleteResult> {
    return await this.nfcCardRepository.delete(id);
  }

  public async createNewReader(): Promise<{ reader: Attractap; token: string }> {
    const token = nanoid(16);
    const apiTokenHash = await securelyHashToken(token);

    const reader = await this.readerRepository.save({
      apiTokenHash,
      name: nanoid(4),
    });

    return {
      reader,
      token,
    };
  }

  public async updateReader(
    id: number,
    updateData: { name?: string; connectedResources?: number[] }
  ): Promise<Attractap> {
    const reader = await this.findReaderById(id);

    if (!reader) {
      throw new Error(`Reader with ID ${id} not found`);
    }

    if (updateData.name) {
      reader.name = updateData.name;
    }

    if (updateData.connectedResources) {
      reader.hasAccessToResourceIds = updateData.connectedResources;
    }

    const response = await this.readerRepository.save(reader);

    this.eventEmitter.emit('reader.updated', new ReaderUpdatedEvent(response));

    return response;
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
   * Generates a new key for the NFC card based on a seed which is based on the current month,
   * the keyNo and the cardUID.
   * @param keyNo The key number to generate
   * @param cardUID The UID of the NFC card
   * @returns 16 bytes Uint8Array
   */
  public async generateNTAG424Key(data: { keyNo: number; cardUID: string }) {
    const seed = `${new Date().getMonth()}${data.keyNo}${data.cardUID}`;
    const seedBytes = new TextEncoder().encode(seed);
    const key = await subtle.digest('SHA-256', seedBytes);
    return new Uint8Array(key).slice(0, 16);
  }
}
