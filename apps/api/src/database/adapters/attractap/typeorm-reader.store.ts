import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Attractap, Resource } from '@attraccess/database-entities';
import type {
  AttractapFirmwareInfo,
  AttractapLinkedResource,
  AttractapReader,
  AttractapReaderEdit,
  AttractapReaderFilter,
  AttractapReaderWithResources,
} from '@attraccess/application-models';
import { FindOptionsWhere, In, Not, Repository } from 'typeorm';
import type { AttractapReaderStore } from '../../../attractap/reader-store.port';
import { toLinkedResource, toReader } from './attractap-mappers';

/** The firmware as the entity stores it: the embedded firmware columns, capabilities included. */
function firmwareColumns(firmware: AttractapFirmwareInfo): Attractap['firmware'] {
  return {
    name: firmware.name,
    variant: firmware.variant,
    version: firmware.version,
    capabilities: { ...firmware.capabilities },
  };
}

@Injectable()
export class TypeOrmAttractapReaderStore implements AttractapReaderStore {
  constructor(
    @InjectRepository(Attractap) private readonly readers: Repository<Attractap>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
  ) {}

  async findById(id: number): Promise<AttractapReaderWithResources | undefined> {
    const reader = await this.readers.findOne({ where: { id }, relations: ['resources'] });
    return reader ? (toReader(reader) as AttractapReaderWithResources) : undefined;
  }

  async list(filter: AttractapReaderFilter = {}): Promise<AttractapReader[]> {
    const where: FindOptionsWhere<Attractap> = {};
    if (filter.paired === true) where.pairingState = 'paired';
    if (filter.paired === false) where.pairingState = Not('paired');
    if (filter.resourceId !== undefined) where.resources = { id: filter.resourceId };
    if (filter.resourceGroupId !== undefined) where.resources = { groups: { id: filter.resourceGroupId } };
    const readers = await this.readers.find({ where, ...(filter.withResources ? { relations: ['resources'] } : {}) });
    return readers.map(toReader);
  }

  async listUnpaired(): Promise<AttractapReader[]> {
    const readers = await this.readers.find({ where: { pairingState: Not('paired') }, relations: ['resources'] });
    return readers.map(toReader);
  }

  async create(input: {
    apiTokenHash: string;
    name: string;
    firmware?: AttractapFirmwareInfo;
  }): Promise<AttractapReader> {
    const saved = await this.readers.save({
      apiTokenHash: input.apiTokenHash,
      name: input.name,
      firmware: input.firmware ? firmwareColumns(input.firmware) : undefined,
    });
    return toReader(saved as Attractap);
  }

  async findResourcesByIds(ids: number[]): Promise<AttractapLinkedResource[]> {
    if (ids.length === 0) return [];
    const found = await this.resources.find({ where: { id: In(ids) } });
    return found.map(toLinkedResource);
  }

  async applyEdit(id: number, edit: AttractapReaderEdit): Promise<void> {
    // Only the editable columns are written: credential columns change concurrently (pairing, revoke) and a
    // stale copy of them must never be saved back.
    const changes: Partial<Attractap> & { id: number } = { id };
    if (edit.name !== undefined) changes.name = edit.name;
    if (edit.ledBrightness !== undefined) changes.ledBrightness = edit.ledBrightness;
    if (edit.firmware) changes.firmware = firmwareColumns(edit.firmware);
    if (edit.resourceIds) changes.resources = edit.resourceIds.map((resourceId) => ({ id: resourceId }) as Resource);
    await this.readers.save(changes);
  }

  async recordConnection(id: number, at: Date): Promise<void> {
    await this.readers.update(id, { lastConnection: at });
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.readers.delete(id);
    return Boolean(result.affected);
  }
}
