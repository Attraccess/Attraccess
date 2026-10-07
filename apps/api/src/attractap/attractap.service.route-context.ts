import { createTranslator } from '../i18n/translate';
import * as de from './rfid-card-notification.de.json';
import * as en from './rfid-card-notification.en.json';
import {
  Attractap,
  AttractapCrashReport,
  AttractapFirmwareVersion,
  NFCCard,
  Resource,
  User,
} from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../encryption/encryption.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { CoredumpSymbolicationService } from './coredump-symbolication.service';
import { AttractapCrashReportDto } from './dtos/crash-report.dto';
import { AttractapFirmwareService } from './firmware.service';

export const t = createTranslator({ en, de });

export abstract class AttractapServiceRouteContext {
  protected abstract readonly notifications: NotificationDispatchService;
  protected abstract readonly logger: Logger;
  protected abstract readonly nfcCardRepository: Repository<NFCCard>;
  protected abstract decryptCardKey(card?: NFCCard | null): NFCCard | undefined;
  protected abstract readonly readerRepository: Repository<Attractap>;
  protected abstract readonly encryptionService: EncryptionService;
  protected abstract notifyNfcCardChange(
    card: NFCCard | undefined,
    action: 'registered' | 'activated' | 'deactivated' | 'deleted',
  ): void;
  public abstract getNFCCardByID(id: number): Promise<NFCCard | undefined>;
  public abstract getNFCCardByUID(uid: string): Promise<NFCCard | undefined>;
  public abstract findReaderById(id: number): Promise<Attractap | undefined>;
  protected abstract readonly resourceRepository: Repository<Resource>;
  protected abstract readonly eventEmitter: EventEmitter2;
  protected abstract readonly audit: AuditService;
  public abstract updateReader(
    id: number,
    updateData: {
      name?: string;
      connectedResourceIds?: number[];
      firmware?: AttractapFirmwareVersion;
      ledBrightness?: number;
    },
    emitEvent?: boolean,
  ): Promise<Attractap>;
  protected abstract readonly crashReportRepository: Repository<AttractapCrashReport>;
  protected abstract toNullableInt(value: number | null | undefined): number | null;
  protected abstract symbolicateCrashReport(
    report: AttractapCrashReport,
    readerId: number,
    coredump: Buffer,
  ): Promise<void>;
  protected abstract readonly coredumpSymbolicationService: CoredumpSymbolicationService;
  protected abstract readonly firmwareService: AttractapFirmwareService;
  protected abstract toCrashReportDto(
    report: AttractapCrashReport,
    currentReaderFirmwareVersion: string | null,
    latestServerFirmwareVersion: string | null,
  ): AttractapCrashReportDto;
  protected abstract compareNullableVersions(left: string | null, right: string | null): boolean | null;
  protected abstract readonly userRepository: Repository<User>;
  protected abstract resolveNfcKeySeedToken(user: User): Promise<string>;
}
