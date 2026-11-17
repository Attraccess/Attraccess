import { Inject, Injectable, Logger } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import type {
  AttractapCrashReportRecord,
  AttractapFirmwareInfo,
  AttractapNfcCard,
  AttractapReader,
  AttractapReaderEdit,
  AttractapReaderFilter,
  AttractapReaderWithResources,
  NewAttractapNfcCard,
} from '@attraccess/application-models';

import { AUDIT_RECORDER, AuditRecorder } from '../audit/recorder/audit-event';

import { EncryptionService } from '../encryption/encryption.service';

import { MetricsService } from '../metrics/metrics.service';

import { NotificationDispatchService } from '../notifications/notification-dispatch.service';

import { CoredumpSymbolicationService } from './coredump-symbolication.service';

import { AttractapFirmwareService } from './firmware.service';

import { AttractapCrashReportDto } from './dtos/crash-report.dto';

import { ReaderCrashReportPayload } from './websockets/websocket.types';

import { randomBytes } from 'crypto';

import { ReaderDeletedEvent, ReaderUpdatedEvent } from './events';

import { securelyHashToken } from './websockets/websocket.utils';

import { ATTRACTAP_CARD_STORE, type AttractapCardStore } from './card-store.port';

import { ATTRACTAP_CRASH_REPORT_STORE, type AttractapCrashReportStore } from './crash-report-store.port';

import { ATTRACTAP_READER_STORE, type AttractapReaderStore } from './reader-store.port';

import { asCoreUser, type NotificationRecipient } from './core-user';

import { NotificationCategory } from '../notifications/notification-types';

import { createTranslator } from '../i18n/translate';

import * as de from './rfid-card-notification.de.json';

import * as en from './rfid-card-notification.en.json';

export const t = createTranslator({ en, de });

@Injectable()
export class AttractapService {
  public constructor(
    @Inject(ATTRACTAP_CARD_STORE)
    protected readonly cardStore: AttractapCardStore,
    @Inject(ATTRACTAP_READER_STORE)
    protected readonly readerStore: AttractapReaderStore,
    @Inject(ATTRACTAP_CRASH_REPORT_STORE)
    protected readonly crashReportStore: AttractapCrashReportStore,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly encryptionService: EncryptionService,
    protected readonly metricsService: MetricsService,
    protected readonly coredumpSymbolicationService: CoredumpSymbolicationService,
    protected readonly firmwareService: AttractapFirmwareService,
    protected readonly notifications: NotificationDispatchService,
    @Inject(AUDIT_RECORDER) protected readonly audit: AuditRecorder,
  ) {}

  protected readonly logger = new Logger(AttractapService.name);

  public async createCrashReport(
    readerId: number,
    payload: ReaderCrashReportPayload,
  ): Promise<AttractapCrashReportRecord> {
    const coredump =
      typeof payload.coredumpBase64 === 'string' && payload.coredumpBase64.length > 0
        ? Buffer.from(payload.coredumpBase64, 'base64')
        : null;

    const report = await this.crashReportStore.create({
      attractapId: readerId,
      resetReason: payload.resetReason,
      rebootReason: payload.rebootReason || null,
      heapFreeBytes: this.toNullableInt(payload.heapFreeBytes),
      largestFreeBlockBytes: this.toNullableInt(payload.largestFreeBlockBytes),
      uptimeBeforeResetMs: this.toNullableInt(payload.uptimeBeforeResetMs),
      wsState: payload.wsState ?? null,
      wifiState: payload.wifiState ?? null,
      firmwareVersion: payload.firmwareVersion ?? null,
      coredumpSize: coredump ? coredump.length : null,
      coredump,
      symbolicationStatus: coredump ? 'pending' : null,
    });

    if (coredump) {
      await this.symbolicateCrashReport(report, readerId, coredump);
    }

    report.coredump = null;
    return report;
  }

  protected async symbolicateCrashReport(
    report: AttractapCrashReportRecord,
    readerId: number,
    coredump: Buffer,
  ): Promise<void> {
    try {
      const reader = await this.readerStore.findById(readerId);
      // No explicit buildId: the symbolication service extracts the truncated app ELF
      // SHA256 from the coredump itself and matches it against published firmware ELFs.
      const result = await this.coredumpSymbolicationService.symbolicate(coredump, {
        variant: reader?.firmware?.variant ?? null,
      });
      await this.crashReportStore.updateSymbolication(report.id, {
        coredumpBuildId: result.buildId,
        symbolicationStatus: result.status,
        symbolizedBacktrace: result.backtrace,
      });
      report.coredumpBuildId = result.buildId;
      report.symbolicationStatus = result.status;
      report.symbolizedBacktrace = result.backtrace;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to symbolicate coredump for report ${report.id}: ${message}`);
      await this.crashReportStore
        .updateSymbolication(report.id, { symbolicationStatus: 'failed', symbolizedBacktrace: message })
        .catch(() => undefined);
      report.symbolicationStatus = 'failed';
      report.symbolizedBacktrace = message;
    }
  }

  public async getCrashReportsForReader(readerId: number): Promise<AttractapCrashReportDto[]> {
    const [reader, reports] = await Promise.all([
      this.readerStore.findById(readerId),
      this.crashReportStore.listForReader(readerId),
    ]);

    const currentReaderFirmwareVersion = reader?.firmware?.version ?? null;
    const latestServerFirmwareVersion =
      reader?.firmware?.name && reader?.firmware?.variant
        ? (this.firmwareService.getFirmwareDefinition(reader.firmware.name, reader.firmware.variant)?.version ?? null)
        : null;

    return reports.map((report) =>
      this.toCrashReportDto(report, currentReaderFirmwareVersion, latestServerFirmwareVersion),
    );
  }

  protected toCrashReportDto(
    report: AttractapCrashReportRecord,
    currentReaderFirmwareVersion: string | null,
    latestServerFirmwareVersion: string | null,
  ): AttractapCrashReportDto {
    const firmwareMatchesCurrentReader = this.compareNullableVersions(
      report.firmwareVersion,
      currentReaderFirmwareVersion,
    );
    const firmwareMatchesLatestServer = this.compareNullableVersions(
      report.firmwareVersion,
      latestServerFirmwareVersion,
    );

    return {
      id: report.id,
      attractapId: report.attractapId,
      resetReason: report.resetReason,
      rebootReason: report.rebootReason,
      heapFreeBytes: report.heapFreeBytes,
      largestFreeBlockBytes: report.largestFreeBlockBytes,
      uptimeBeforeResetMs: report.uptimeBeforeResetMs,
      wsState: report.wsState,
      wifiState: report.wifiState,
      firmwareVersion: report.firmwareVersion,
      currentReaderFirmwareVersion,
      latestServerFirmwareVersion,
      firmwareMatchesCurrentReader,
      firmwareMatchesLatestServer,
      coredumpSize: report.coredumpSize,
      coredumpBuildId: report.coredumpBuildId,
      coredumpBuildIdKnown: report.coredumpBuildId
        ? this.firmwareService.hasSymbolForBuildId(report.coredumpBuildId)
        : null,
      symbolicationStatus: report.symbolicationStatus,
      symbolizedBacktrace: report.symbolizedBacktrace,
      createdAt: report.createdAt,
    };
  }

  protected compareNullableVersions(left: string | null, right: string | null): boolean | null {
    if (!left || !right) {
      return null;
    }
    return left === right;
  }

  public async getCrashReportCoredump(
    readerId: number,
    reportId: number,
  ): Promise<{ filename: string; coredump: Uint8Array } | null> {
    const coredump = await this.crashReportStore.findCoredump(readerId, reportId);

    if (!coredump) {
      return null;
    }

    return {
      filename: `reader-${readerId}-crash-${reportId}.coredump`,
      coredump,
    };
  }

  protected toNullableInt(value: number | null | undefined): number | null {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return null;
    }
    return Math.trunc(value);
  }

  public async updateLastReaderConnection(id: number): Promise<void> {
    await this.readerStore.recordConnection(id, new Date());
  }

  public async findReaderById(id: number): Promise<AttractapReaderWithResources | undefined> {
    return await this.readerStore.findById(id);
  }

  public async createNewReader(firmware?: AttractapFirmwareInfo): Promise<{ reader: AttractapReader; token: string }> {
    const token = randomBytes(12).toString('base64url').slice(0, 16);
    const apiTokenHash = await securelyHashToken(token);

    const reader = await this.readerStore.create({
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
      firmware?: AttractapFirmwareInfo;
      ledBrightness?: number;
    },
    emitEvent = true,
  ): Promise<AttractapReaderWithResources> {
    const reader = await this.findReaderById(id);

    if (!reader) {
      throw new Error(`Reader with ID ${id} not found`);
    }

    const edit: AttractapReaderEdit = {};

    if (updateData.name) {
      edit.name = updateData.name;
    }

    if (updateData.ledBrightness !== undefined) {
      edit.ledBrightness = updateData.ledBrightness;
    }

    const firmware = updateData.firmware ?? reader.firmware;
    if (updateData.firmware) {
      this.logger.debug('Updating reader firmware info', updateData.firmware);
      edit.firmware = updateData.firmware;
    }

    this.logger.debug('updateData', updateData);
    if (updateData.connectedResourceIds) {
      this.logger.debug('attaching resources to reader', updateData.connectedResourceIds);
      let resources = await this.readerStore.findResourcesByIds(updateData.connectedResourceIds);

      this.logger.debug('resources from db', resources);

      if (!firmware.capabilities.resourceSelection && resources.length > 1) {
        this.logger.warn(
          'More than one resource selected for reader, but resource selection is not supported by the firmware, selecting only the first one',
        );
        resources = [resources[0]];
      }

      this.logger.debug('resources for reader', resources);
      edit.resourceIds = resources.map((resource) => resource.id);
    }

    // Credential columns are owned by the credential registry and change concurrently (pairing,
    // revoke): the store never writes them from here.
    await this.readerStore.applyEdit(id, edit);
    const response = (await this.findReaderById(id)) ?? reader;

    if (emitEvent) {
      this.eventEmitter.emit(ReaderUpdatedEvent.EVENT_NAME, new ReaderUpdatedEvent(response));
    }

    return response;
  }

  public async deleteReader(id: number): Promise<boolean> {
    if (!(await this.readerStore.delete(id))) return false;

    this.eventEmitter.emit(ReaderDeletedEvent.EVENT_NAME, new ReaderDeletedEvent(id));
    return true;
  }

  public async recordReaderDeregistration(
    readerId: number,
    principal: { userId: number; authenticationMethod: 'session' | 'api-token'; apiTokenId?: number },
  ): Promise<void> {
    await this.audit.record({
      domain: 'attractap',
      action: 'attractap.reader.deregistered',
      actor: {
        id: principal.userId,
        authenticationMethod: principal.authenticationMethod,
        ...(principal.authenticationMethod === 'api-token' ? { apiTokenId: principal.apiTokenId } : {}),
      },
      subject: { type: 'attractap.reader', id: readerId },
      details: { source: 'admin-api' },
    });
  }

  /**
   * Updates the firmware version and type for a reader
   * @param id The reader ID
   * @param firmware The firmware the reader reported
   */
  public async updateReaderFirmware(id: number, firmware: AttractapFirmwareInfo) {
    await this.updateReader(id, { firmware }, false);
  }

  public async getAllReaders(filter?: AttractapReaderFilter): Promise<AttractapReader[]> {
    return await this.readerStore.list(filter);
  }

  /**
   * Readers that completed pairing. Every list the rest of the product reads (readers page,
   * pickers, resource assignment, card writer setting) uses this one; unpaired readers belong to
   * the pairing session only.
   */
  public async getPairedReaders(filter: AttractapReaderFilter = {}): Promise<AttractapReader[]> {
    return await this.readerStore.list({ ...filter, paired: true });
  }

  /** Readers that must be paired before they can be used: the pairing session's list. */
  public async getReadersToPair(): Promise<AttractapReader[]> {
    return await this.readerStore.listUnpaired();
  }

  /** A new card key: 16 random bytes from the system CSPRNG, hex encoded. Nothing about it is derivable. */
  public generateCardKey(): string {
    return randomBytes(16).toString('hex');
  }

  protected notifyNfcCardChange(
    card: AttractapNfcCard | undefined,
    action: 'registered' | 'activated' | 'deactivated' | 'deleted',
  ): void {
    if (!card?.user) {
      return;
    }
    const owner = card.user;

    void this.notifications
      .dispatch({
        category: NotificationCategory.NFC_CARDS,
        recipients: [asCoreUser(owner)],
        title: (recipient: NotificationRecipient) => t(recipient.locale, `${action}Title`),
        body: (recipient: NotificationRecipient) => t(recipient.locale, `${action}Body`, { cardId: card.id }),
        url: '/attractap/nfc-cards',
        dedupeKey: `nfc-card-${card.id}-${action}`,
      })
      .catch((error) => {
        this.logger.error(`Failed to notify user ${owner.id} about RFID card ${action}: ${(error as Error).message}`);
      });
  }

  public async getNFCCardByID(id: number): Promise<AttractapNfcCard | undefined> {
    return this.decryptCardKey(await this.cardStore.findById(id));
  }

  public async getNFCCardsByUserId(userId: number): Promise<AttractapNfcCard[]> {
    const cards = await this.cardStore.listForUser(userId);
    cards.forEach((card) => this.decryptCardKey(card));
    return cards;
  }

  public async getAllNFCCards(): Promise<AttractapNfcCard[]> {
    const cards = await this.cardStore.listAll();
    cards.forEach((card) => this.decryptCardKey(card));
    return cards;
  }

  public async getNFCCardByUID(uid: string): Promise<AttractapNfcCard | undefined> {
    return this.decryptCardKey(await this.cardStore.findByUid(uid));
  }

  public async createNFCCard(
    user: { id: number },
    data: NewAttractapNfcCard,
    options: { activate?: boolean } = {},
  ): Promise<AttractapNfcCard> {
    const activate = options.activate ?? true;
    const card = await this.cardStore.create(
      user.id,
      { uid: data.uid, keyNo: data.keyNo, key: this.encryptionService.encrypt(data.key) },
      activate,
    );
    this.notifyNfcCardChange(card, 'registered');
    return card;
  }

  public async userHasActiveNFCCard(userId: number): Promise<boolean> {
    return await this.cardStore.userHasActiveCard(userId);
  }

  /**
   * Activates an RFID card (deactivates all other cards for the same user)
   * @param id The ID of the RFID card to activate
   * @returns The activated RFID card
   */
  public async activateNFCCard(id: number): Promise<AttractapNfcCard> {
    const card = await this.cardStore.activateExclusively(id);
    this.notifyNfcCardChange(card, 'activated');
    return card;
  }

  /**
   * Deactivates an RFID card
   * @param id The ID of the RFID card to deactivate
   * @returns The deactivated RFID card
   */
  public async deactivateNFCCard(id: number): Promise<AttractapNfcCard> {
    await this.cardStore.deactivate(id);
    const card = await this.getNFCCardByID(id);
    this.notifyNfcCardChange(card, 'deactivated');
    return card;
  }

  /** True when a card was deleted. */
  public async deleteNFCCard(id: number): Promise<boolean> {
    const card = await this.getNFCCardByID(id);
    const deleted = await this.cardStore.delete(id);
    this.notifyNfcCardChange(card, 'deleted');
    return deleted;
  }

  public async updateNFCCardLastSeen(uid: string): Promise<null | true> {
    const card = await this.getNFCCardByUID(uid);

    if (!card) {
      return null;
    }

    await this.cardStore.recordSeen(card.id, new Date());
    return true;
  }

  /**
   * Decrypts card key in place for use in the app. Assumes stored values are
   * already encrypted (see migration EncryptSensitiveData).
   */
  protected decryptCardKey(card?: AttractapNfcCard | null): AttractapNfcCard | undefined {
    if (!card?.key) {
      return card ?? undefined;
    }
    card.key = this.encryptionService.decryptIfEncrypted(card.key) ?? card.key;
    return card;
  }
}
