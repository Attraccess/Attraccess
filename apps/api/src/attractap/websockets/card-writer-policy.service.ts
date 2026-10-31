import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { SettingsStoreService } from '../../settings/settings-store.service';
import { ATTRACTAP_KEYS, ATTRACTAP_PARENT } from '../../settings/constants';
import { CardWriterMode, CardWriterSettingsDto } from '../dtos/card-writer-settings.dto';

/** Error code the frontend translates; see api-errors.{en,de}.json. */
export const READER_NOT_ALLOWED_TO_WRITE_CARDS = 'READER_NOT_ALLOWED_TO_WRITE_CARDS';

/**
 * Which readers may enroll and reset cards. Card keys are written through these readers, so an
 * operator can limit the work to readers in a trusted place. The default is every reader.
 */
@Injectable()
export class CardWriterPolicyService {
  @Inject(SettingsStoreService)
  private readonly settings: SettingsStoreService;

  async get(): Promise<CardWriterSettingsDto> {
    const storedMode = await this.settings.getPlainSetting(ATTRACTAP_PARENT, ATTRACTAP_KEYS.cardWriterMode);
    const mode: CardWriterMode = storedMode === 'selected' ? 'selected' : 'all';
    const raw = await this.settings.getPlainSetting(ATTRACTAP_PARENT, ATTRACTAP_KEYS.cardWriterReaders);
    let readerIds: number[] = [];
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      readerIds = Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)) : [];
    } catch {
      readerIds = [];
    }
    return { mode, readerIds };
  }

  async set(settings: CardWriterSettingsDto): Promise<CardWriterSettingsDto> {
    const readerIds = [...new Set(settings.readerIds)].sort((a, b) => a - b);
    await this.settings.setPlainSetting(ATTRACTAP_PARENT, ATTRACTAP_KEYS.cardWriterMode, settings.mode);
    await this.settings.setPlainSetting(ATTRACTAP_PARENT, ATTRACTAP_KEYS.cardWriterReaders, JSON.stringify(readerIds));
    return { mode: settings.mode, readerIds };
  }

  async isAllowed(readerId: number): Promise<boolean> {
    const { mode, readerIds } = await this.get();
    return mode === 'all' || readerIds.includes(readerId);
  }

  async assertAllowed(readerId: number): Promise<void> {
    if (!(await this.isAllowed(readerId))) {
      throw new ForbiddenException(READER_NOT_ALLOWED_TO_WRITE_CARDS);
    }
  }
}
