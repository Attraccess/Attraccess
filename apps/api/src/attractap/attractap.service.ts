import type { AuditAuthenticationMethod } from '@attraccess/application-models';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import type {
  AttractapCrashReportRecord,
  AttractapCardOwner,
  AttractapFirmwareInfo,
  AttractapNfcCard,
  AttractapReader,
  AttractapReaderEdit,
  AttractapReaderFilter,
  AttractapReaderSecurityPatch,
  AttractapReaderWithResources,
  NewAttractapNfcCard,
  NotificationRecipient,
} from '@attraccess/application-models';

import { AUDIT_RECORDER, AuditRecorder } from '../audit/recorder/audit-event';

import { EncryptionService } from '../encryption/encryption.service';

import { MetricsService } from '../metrics/metrics.service';

import { NotificationDispatchService } from '../notifications/notification-dispatch.service';

import { CoredumpSymbolicationService } from './coredump-symbolication.service';

import { AttractapFirmwareService } from './firmware.service';

import { AttractapCrashReportDto } from './dtos/crash-report.dto';

import { toCrashReportDto } from './dtos/crash-report.mapper';

import { ReaderCrashReportPayload } from './websockets/websocket.types';

import { randomBytes } from 'crypto';

import { Semaphore } from 'async-mutex';

import { ReaderDeletedEvent, ReaderUpdatedEvent } from './events';

import { ATTRACTAP_CARD_STORE, type AttractapCardStore } from './card-store.port';

import { ATTRACTAP_CRASH_REPORT_STORE, type AttractapCrashReportStore } from './crash-report-store.port';

import { ATTRACTAP_READER_STORE, type AttractapReaderStore } from './reader-store.port';
import { isSecurableBuild } from './security/secured-eligibility';
import type { ReportedBuild } from './security/session-security-state';

import {
  BLE_BRIDGE_MESSAGE,
  BLE_BRIDGE_READER_CAPABILITIES,
  attractapReaderCapabilities,
  canAssign,
  isBleBridge,
} from '../resources/reader-capabilities/reader-capabilities';

import { NotificationCategory } from '../notifications/notification-types';

import { createTranslator } from '../i18n/translate';

import * as de from './rfid-card-notification.de.json';

import * as en from './rfid-card-notification.en.json';

export const t = createTranslator({ en, de });

/**
 * Coredumps symbolicated at once. Each run spawns esp-coredump and gdb; after a rollout many readers upload
 * their stranded dumps together, and the rest wait their turn.
 */
export const SYMBOLICATION_CONCURRENCY = 2;

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

  protected readonly symbolicationSlots = new Semaphore(SYMBOLICATION_CONCURRENCY);

  /**
   * Stores a crash report. A legacy reader sends its dump inline; a newer one announces `expectedCoredump`
   * and uploads it in chunks afterwards (ATT-1144), so the report waits for it (`coredumpStatus: awaiting`).
   * A dump the server refused is recorded as `rejected` (with its announced size, if valid) so admins know
   * the reader still holds one.
   */
  public async createCrashReport(
    readerId: number,
    payload: ReaderCrashReportPayload,
    expectedCoredump: { size: number; crc32: number } | null = null,
    rejectedCoredump: { size: number | null } | null = null,
  ): Promise<AttractapCrashReportRecord> {
    const coredump =
      typeof payload.coredumpBase64 === 'string' && payload.coredumpBase64.length > 0
        ? Buffer.from(payload.coredumpBase64, 'base64')
        : null;
    const awaiting = !coredump && expectedCoredump !== null;
    const rejected = !coredump && !awaiting && rejectedCoredump !== null;

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
      coredumpStatus: coredump ? 'stored' : awaiting ? 'awaiting' : rejected ? 'rejected' : null,
      coredumpExpectedSize: awaiting ? expectedCoredump.size : rejected ? rejectedCoredump.size : null,
      coredumpExpectedCrc32: awaiting ? expectedCoredump.crc32 : null,
      symbolicationStatus: coredump ? 'pending' : null,
    });

    if (coredump) {
      await this.symbolicateCrashReport(report, readerId, coredump);
    }

    report.coredump = null;
    return report;
  }

  /** The report a reader uploads a coredump to; null unless that reader owns it. */
  public async findCrashReportOfReader(reportId: number, readerId: number): Promise<AttractapCrashReportRecord | null> {
    return this.crashReportStore.findOfReader(reportId, readerId);
  }

  /**
   * The newest report of the reader that still awaits exactly this dump: metadata the reader sent again
   * because the acknowledgement got lost.
   */
  public async findAwaitingCrashReport(
    readerId: number,
    expectedCoredump: { size: number; crc32: number },
  ): Promise<AttractapCrashReportRecord | null> {
    return this.crashReportStore.findAwaiting(readerId, expectedCoredump);
  }

  /**
   * Saves a verified chunked upload to its waiting report and symbolicates it like an inline dump.
   * False when the report no longer waits for a dump (already stored, or deleted meanwhile).
   */
  public async storeUploadedCoredump(report: AttractapCrashReportRecord, coredump: Buffer): Promise<boolean> {
    if (!(await this.crashReportStore.storeAwaitedCoredump(report, coredump))) return false;
    report.coredumpSize = coredump.length;
    report.coredumpStatus = 'stored';
    report.symbolicationStatus = 'pending';
    await this.symbolicateCrashReport(report, report.attractapId, coredump);
    return true;
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
      const result = await this.symbolicationSlots.runExclusive(() =>
        this.coredumpSymbolicationService.symbolicate(coredump, { variant: reader?.firmware?.variant ?? null }),
      );
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
      toCrashReportDto(report, currentReaderFirmwareVersion, latestServerFirmwareVersion, (buildId) =>
        this.firmwareService.hasSymbolForBuildId(buildId),
      ),
    );
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

  /** A record for a reader the admin approved. It starts without a credential; pairing writes the first one. */
  public async createNewReader(firmware?: AttractapFirmwareInfo): Promise<AttractapReader> {
    return await this.readerStore.create({
      name: randomBytes(3).toString('base64url').slice(0, 4),
      firmware,
    });
  }

  public async updateReader(
    id: number,
    updateData: {
      name?: string;
      connectedResourceIds?: number[];
      firmware?: AttractapFirmwareInfo;
      ledBrightness?: number;
      allowPluginBle?: boolean;
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

    if (updateData.allowPluginBle !== undefined) {
      edit.allowPluginBle = updateData.allowPluginBle;
    }

    const firmware = updateData.firmware ?? reader.firmware;
    let openedForPlugins = false;
    let droppedResources = false;
    if (updateData.firmware) {
      this.logger.debug('Updating reader firmware info', updateData.firmware);
      const becameBridge = !isBleBridge(reader) && isBleBridge(updateData);
      // A BLE Bridge exists to carry plugin Bluetooth traffic, so it starts open for plugins. Only when the
      // reader becomes a bridge: an administrator who turns it off later keeps it off across reconnects.
      openedForPlugins = becameBridge && !reader.allowPluginBle;
      if (openedForPlugins) edit.allowPluginBle = true;
      // A bridge cannot serve resources: drop the links it kept from before, instead of waiting for an admin's save.
      droppedResources = becameBridge && (reader.resources?.length ?? 0) > 0;
      if (droppedResources) edit.resourceIds = [];
      edit.firmware = updateData.firmware;
    }

    this.logger.debug('updateData', updateData);
    if (updateData.connectedResourceIds) {
      this.logger.debug('attaching resources to reader', updateData.connectedResourceIds);
      let resources = await this.readerStore.findResourcesByIds(updateData.connectedResourceIds);

      this.logger.debug('resources from db', resources);
      const capabilities = attractapReaderCapabilities(reader);
      const unserved = resources.filter((resource) => !canAssign(capabilities, resource));
      if (unserved.length > 0) {
        throw new BadRequestException(
          capabilities === BLE_BRIDGE_READER_CAPABILITIES
            ? BLE_BRIDGE_MESSAGE
            : `This reader cannot serve ${unserved.map((resource) => `"${resource.name}"`).join(', ')}`,
        );
      }

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

    // Opening a new bridge for plugins is always announced: running advertisement watches add it from the event.
    // Dropping a new bridge's resources is too, so resource pages stop listing it.
    if (emitEvent || openedForPlugins || droppedResources) {
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
    principal: { userId: number; authenticationMethod: AuditAuthenticationMethod; apiTokenId?: number },
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
   * Stores what the reader reported about its build (profile, app secure_version). A claim: it never makes a reader
   * secured. A reader that is not a release secure build any more loses `secured` right away. Every connection
   * reports its build, so only what differs from the stored columns is written, and usually nothing is.
   */
  public async recordReaderBuild(id: number, build: ReportedBuild) {
    const stored = await this.readerStore.findSecurity(id);
    if (!stored) return;
    const patch: AttractapReaderSecurityPatch = {};
    if (stored.firmwareProfile !== build.profile) patch.firmwareProfile = build.profile;
    if (stored.secureVersion !== build.secureVersion) patch.secureVersion = build.secureVersion;
    // Same eligibility as the eFuse report check: a plain, secure-lab, non-release, demo or debug build never stays secured.
    if (!isSecurableBuild(build) && (stored.secured || stored.securedAt !== null)) {
      patch.secured = false;
      patch.securedAt = null;
    }
    if (Object.keys(patch).length > 0) await this.readerStore.applySecurity(id, patch);
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
   * Readers that are paired. Every list the rest of the product reads (readers page, pickers,
   * resource assignment, card writer setting) uses this one; readers whose pairing was removed
   * belong to the pairing session only.
   */
  public async getPairedReaders(filter: AttractapReaderFilter = {}): Promise<AttractapReader[]> {
    return await this.readerStore.list({ ...filter, paired: true });
  }

  /** Readers whose pairing was removed and that must be paired again: the pairing session's list. */
  public async getReadersToPair(): Promise<AttractapReader[]> {
    return await this.readerStore.listRevoked();
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
        // A card owner carries the id, address and locale the dispatcher reads.
        recipients: [owner],
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
    user: AttractapCardOwner,
    data: NewAttractapNfcCard,
    options: { activate?: boolean } = {},
  ): Promise<AttractapNfcCard> {
    const activate = options.activate ?? true;
    const card = await this.cardStore.create(
      user,
      {
        uid: data.uid,
        ...(data.type ? { type: data.type } : {}),
        keyNo: data.keyNo,
        key: data.key == null ? null : this.encryptionService.encrypt(data.key),
      },
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
