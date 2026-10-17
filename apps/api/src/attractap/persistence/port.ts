import type {
  Attractap,
  AttractapCrashReport,
  AttractapFirmwareVersion,
  NFCCard,
  Resource,
  User,
} from '@attraccess/application-models';
export type NewCrashReport = Omit<
  AttractapCrashReport,
  'id' | 'createdAt' | 'attractap' | 'coredumpBuildId' | 'symbolizedBacktrace'
>;
export type NewCard = Omit<NFCCard, 'id' | 'createdAt' | 'updatedAt' | 'lastSeen' | 'isActive'>;
export interface CardDeletion {
  affected: number;
}
export abstract class AttractapPersistence {
  abstract recordCrash(report: NewCrashReport): Promise<AttractapCrashReport>;
  abstract readerFirmware(readerId: number): Promise<Attractap | null>;
  abstract recordSymbolication(
    reportId: number,
    status: string,
    backtrace: string | null,
    buildId?: string | null,
  ): Promise<void>;
  abstract readerCrashReports(readerId: number): Promise<AttractapCrashReport[]>;
  abstract crashCoredump(readerId: number, reportId: number): Promise<AttractapCrashReport | null>;
  abstract touchReader(id: number, at: Date): Promise<void>;
  abstract readerWithResources(id: number): Promise<Attractap | null>;
  abstract registerReader(apiTokenHash: string, name: string, firmware?: AttractapFirmwareVersion): Promise<Attractap>;
  abstract resourcesByIds(ids: readonly number[]): Promise<Resource[]>;
  abstract saveReader(reader: Attractap): Promise<Attractap>;
  abstract removeReader(id: number): Promise<boolean>;
  abstract listReaders(withResources: boolean): Promise<Attractap[]>;
  abstract findUser(id: number): Promise<User | null>;
  abstract saveUser(user: User): Promise<void>;
  abstract cardById(id: number): Promise<NFCCard | null>;
  abstract cardByUid(uid: string): Promise<NFCCard | null>;
  abstract userCards(userId: number): Promise<NFCCard[]>;
  abstract allCards(): Promise<NFCCard[]>;
  /** Register an active card and deactivate the owner's other cards atomically. */
  abstract registerActiveCard(card: NewCard): Promise<NFCCard>;
  /** Returns null without changes if the requested card no longer exists. */
  abstract activateCard(id: number): Promise<NFCCard | null>;
  abstract deactivateCard(id: number): Promise<void>;
  abstract removeCard(id: number): Promise<boolean>;
  abstract touchCard(id: number, at: Date): Promise<void>;
}

export abstract class AttractapResourceReader {
  abstract findResource(id: number): Promise<Resource | null>;
}
