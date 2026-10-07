import { Attractap, AttractapFirmwareVersion, Resource } from '@attraccess/database-entities';
import { randomBytes } from 'crypto';
import { FindManyOptions, In } from 'typeorm';
import { AttractapCardKeysImplementation } from './attractap-card-keys';
import { ReaderDeletedEvent, ReaderUpdatedEvent } from './events';
import { securelyHashToken } from './websockets/websocket.utils';
export abstract class AttractapReaderStorageImplementation extends AttractapCardKeysImplementation {
  public async updateLastReaderConnection(id: number) {
    return await this.readerRepository.update(id, { lastConnection: new Date() });
  }

  public async findReaderById(id: number): Promise<Attractap | undefined> {
    return await this.readerRepository.findOne({
      where: { id },
      relations: [
        'resources',
        'resources.billingConfigurations',
        'resources.introducers',
        'resources.introducers.user',
      ],
    });
  }

  public async createNewReader(firmware?: AttractapFirmwareVersion): Promise<{ reader: Attractap; token: string }> {
    const token = randomBytes(12).toString('base64url').slice(0, 16);
    const apiTokenHash = await securelyHashToken(token);

    const reader = await this.readerRepository.save({
      apiTokenHash,
      name: randomBytes(3).toString('base64url').slice(0, 4),
      firmware,
    });

    return {
      reader,
      token,
    };
  }

  public async updateReader(
    id: number,
    updateData: {
      name?: string;
      connectedResourceIds?: number[];
      firmware?: AttractapFirmwareVersion;
      ledBrightness?: number;
    },
    emitEvent = true,
  ): Promise<Attractap> {
    const reader = await this.findReaderById(id);

    if (!reader) {
      throw new Error(`Reader with ID ${id} not found`);
    }

    if (updateData.name) {
      reader.name = updateData.name;
    }

    if (updateData.ledBrightness !== undefined) {
      reader.ledBrightness = updateData.ledBrightness;
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

      if (!reader.firmware.capabilities.resourceSelection && resources.length > 1) {
        this.logger.warn(
          'More than one resource selected for reader, but resource selection is not supported by the firmware, selecting only the first one',
        );
        resources = [resources[0]];
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

  public async deleteReader(id: number): Promise<boolean> {
    const result = await this.readerRepository.delete(id);
    if (!result.affected) return false;

    this.eventEmitter.emit(ReaderDeletedEvent.EVENT_NAME, new ReaderDeletedEvent(id));
    return true;
  }

  public async recordReaderDeregistration(
    readerId: number,
    principal: { userId: number; authenticationMethod: 'session' | 'api-token'; apiTokenId?: number },
  ): Promise<void> {
    await this.audit.recordAttractap({
      action: 'reader.deregistered',
      actorId: principal.userId,
      authenticationMethod: principal.authenticationMethod,
      ...(principal.authenticationMethod === 'api-token' ? { apiTokenId: principal.apiTokenId } : {}),
      subjectId: readerId,
      details: { source: 'admin-api' },
    });
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
}
