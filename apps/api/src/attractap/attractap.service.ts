import { Inject, Injectable, Logger } from '@nestjs/common';
import { subtle } from 'crypto';
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
    private readonly resourceRepository: Repository<Resource>
  ) {}

  public async getNFCCardByID(id: number): Promise<NFCCard | undefined> {
    return await this.nfcCardRepository.findOne({ where: { id } });
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
    data: Omit<NFCCard, 'id' | 'createdAt' | 'updatedAt' | 'user'>
  ): Promise<NFCCard> {
    return await this.nfcCardRepository.save({
      ...data,
      user,
    });
  }

  public async deleteNFCCard(id: number): Promise<DeleteResult> {
    return await this.nfcCardRepository.delete(id);
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
  public async updateReaderFirmware(id: number, firmware: AttractapFirmwareVersion): Promise<Attractap> {
    return await this.updateReader(id, { firmware }, false);
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
