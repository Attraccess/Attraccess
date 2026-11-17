import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ReaderUiPluginSettings,
  ReaderUiReaderSettings,
  ReaderUiResourceSettings,
} from '@attraccess/database-entities';
import type { NoScreenPolicy } from '@attraccess/plugins-backend-sdk';
import { In, Repository } from 'typeorm';
import type {
  ReaderUiPluginSetting,
  ReaderUiSettingsStore,
} from '../../../plugin-system/reader-ui/reader-ui-settings.port';

const toSetting = (row: ReaderUiPluginSettings): ReaderUiPluginSetting => ({
  resourceId: row.resourceId,
  plugin: row.plugin,
  widgetsEnabled: row.widgetsEnabled,
  hookFailurePolicy: row.hookFailurePolicy,
});

/** TypeORM implementation of the reader UI settings store. */
@Injectable()
export class ReaderUiSettingsAdapter implements ReaderUiSettingsStore {
  constructor(
    @InjectRepository(ReaderUiResourceSettings) private readonly resources: Repository<ReaderUiResourceSettings>,
    @InjectRepository(ReaderUiPluginSettings) private readonly plugins: Repository<ReaderUiPluginSettings>,
    @InjectRepository(ReaderUiReaderSettings) private readonly readers: Repository<ReaderUiReaderSettings>,
  ) {}

  async getNoScreenPolicy(resourceId: number): Promise<NoScreenPolicy | null> {
    return (await this.resources.findOne({ where: { resourceId } }))?.noScreenPolicy ?? null;
  }

  async listPluginSettings(resourceId: number): Promise<ReaderUiPluginSetting[]> {
    return (await this.plugins.find({ where: { resourceId }, order: { plugin: 'ASC' } })).map(toSetting);
  }

  async getPluginSetting(resourceId: number, plugin: string): Promise<ReaderUiPluginSetting | null> {
    const row = await this.plugins.findOne({ where: { resourceId, plugin } });
    return row ? toSetting(row) : null;
  }

  async getReaderWidgetsEnabled(readerId: number): Promise<boolean | null> {
    return (await this.readers.findOne({ where: { readerId } }))?.widgetsEnabled ?? null;
  }

  async listDisabledPluginSettings(resourceIds: number[]): Promise<ReaderUiPluginSetting[]> {
    if (resourceIds.length === 0) return [];
    return (await this.plugins.find({ where: { resourceId: In(resourceIds), widgetsEnabled: false } })).map(toSetting);
  }

  async setNoScreenPolicy(resourceId: number, policy: NoScreenPolicy | null): Promise<void> {
    await this.resources.save({ resourceId, noScreenPolicy: policy });
  }

  async setPluginSetting(setting: ReaderUiPluginSetting): Promise<void> {
    await this.plugins.save({ ...setting });
  }

  async setReaderWidgetsEnabled(readerId: number, widgetsEnabled: boolean): Promise<void> {
    await this.readers.save({ readerId, widgetsEnabled });
  }
}
