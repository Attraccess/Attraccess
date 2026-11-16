import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { SettingsStoreService } from '../../settings/settings-store.service';
import { ATTRACTAP_KEYS, ATTRACTAP_PARENT } from '../../settings/constants';
import { CardWriterMode, CardWriterSettingsDto } from '../dtos/card-writer-settings.dto';
import { auditSubjectKeyId } from '../../audit/policies/administration';
import { AUDIT_RECORDER, AuditActor, AuditRecorder } from '../../audit/recorder/audit-event';

/** Error code the frontend translates; see api-errors.{en,de}.json. */
export const READER_NOT_ALLOWED_TO_WRITE_CARDS = 'READER_NOT_ALLOWED_TO_WRITE_CARDS';

/** Audit values are capped at 256 characters; a longer reader list is recorded as a count instead. */
const AUDIT_VALUE_MAX_LENGTH = 256;

/** Audit rows (setting key, before, after) for every value the update changed. */
export function cardWriterSettingChanges(
  before: CardWriterSettingsDto,
  after: CardWriterSettingsDto,
): Array<[string, string, string]> {
  const changes: Array<[string, string, string]> = [];
  if (before.mode !== after.mode) changes.push(['attractap.cardWriterMode', before.mode, after.mode]);
  const oldReaders = before.readerIds.join(',');
  const newReaders = after.readerIds.join(',');
  if (oldReaders !== newReaders) {
    if (oldReaders.length <= AUDIT_VALUE_MAX_LENGTH && newReaders.length <= AUDIT_VALUE_MAX_LENGTH) {
      changes.push(['attractap.cardWriterReaders', oldReaders, newReaders]);
    } else {
      changes.push([
        'attractap.cardWriterReaderCount',
        String(before.readerIds.length),
        String(after.readerIds.length),
      ]);
    }
  }
  return changes;
}

/**
 * Which readers may enroll and reset cards. Card keys are written through these readers, so an
 * operator can limit the work to readers in a trusted place. The default is every reader.
 */
@Injectable()
export class CardWriterPolicyService {
  @Inject(SettingsStoreService)
  private readonly settings: SettingsStoreService;

  @Inject(AUDIT_RECORDER)
  private readonly audit: AuditRecorder;

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

  /** Stores the setting and audits every value the update changed, including a revoked reader it removes. */
  async update(settings: CardWriterSettingsDto, actor: AuditActor): Promise<CardWriterSettingsDto> {
    const before = await this.get();
    const after = await this.set(settings);
    for (const [settingKey, oldValue, newValue] of cardWriterSettingChanges(before, after)) {
      await this.audit.record({
        domain: 'administration',
        action: 'settings.updated',
        actor,
        subject: { type: 'setting', id: auditSubjectKeyId(settingKey) },
        details: { settingKey, before: oldValue, after: newValue },
      });
    }
    return after;
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
