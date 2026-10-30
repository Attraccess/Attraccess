import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { SettingsStoreService } from '../../settings/settings-store.service';
import { CardWriterMode, CardWriterSettingsDto } from '../dtos/card-writer-settings.dto';

const PARENT = 'attractap';
const MODE_KEY = 'card_writer_mode';
const READERS_KEY = 'card_writer_readers';

/**
 * Which readers may enroll and reset cards. Card keys are written through these readers, so an
 * operator can limit the work to readers in a trusted place. The default is every reader.
 */
@Injectable()
export class CardWriterPolicyService {
  @Inject(SettingsStoreService)
  private readonly settings: SettingsStoreService;

  async get(): Promise<CardWriterSettingsDto> {
    const mode = (await this.settings.getPlainSetting(PARENT, MODE_KEY)) === 'selected' ? 'selected' : 'all';
    const raw = await this.settings.getPlainSetting(PARENT, READERS_KEY);
    let readerIds: number[] = [];
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      readerIds = Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)) : [];
    } catch {
      readerIds = [];
    }
    return { mode: mode as CardWriterMode, readerIds };
  }

  async set(settings: CardWriterSettingsDto): Promise<CardWriterSettingsDto> {
    const readerIds = [...new Set(settings.readerIds)].sort((a, b) => a - b);
    await this.settings.setPlainSetting(PARENT, MODE_KEY, settings.mode);
    await this.settings.setPlainSetting(PARENT, READERS_KEY, JSON.stringify(readerIds));
    return { mode: settings.mode, readerIds };
  }

  async isAllowed(readerId: number): Promise<boolean> {
    const { mode, readerIds } = await this.get();
    return mode === 'all' || readerIds.includes(readerId);
  }

  async assertAllowed(readerId: number): Promise<void> {
    if (!(await this.isAllowed(readerId))) {
      throw new ForbiddenException('This reader is not allowed to enroll or reset cards');
    }
  }
}
