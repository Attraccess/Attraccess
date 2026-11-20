import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Attractap,
  AttractapCrashReport,
  AttractapCredentialEvent,
  AttractapInstallation,
  AttractapSecureBootKey,
  NFCCard,
  NFCCardPendingChange,
  Resource,
  ResourceUsage,
} from '@attraccess/database-entities';
import { ATTRACTAP_CARD_STORE } from '../../../attractap/card-store.port';
import { ATTRACTAP_CRASH_REPORT_STORE } from '../../../attractap/crash-report-store.port';
import { ATTRACTAP_RESOURCE_READS } from '../../../attractap/reader-resource-reads.port';
import { ATTRACTAP_READER_STORE } from '../../../attractap/reader-store.port';
import { ATTRACTAP_SECURE_BOOT_KEY_STORE } from '../../../attractap/secure-boot/secure-boot-key-store.port';
import { ATTRACTAP_CREDENTIAL_STORE } from '../../../attractap/security/credential-store.port';
import { ATTRACTAP_INSTALLATION_STORE } from '../../../attractap/security/installation-store.port';
import { PersistenceCoreModule } from '../common/persistence-core.module';
import { TypeOrmAttractapCardStore } from './typeorm-card.store';
import { TypeOrmAttractapCrashReportStore } from './typeorm-crash-report.store';
import { TypeOrmAttractapCredentialStore } from './typeorm-credential.store';
import { TypeOrmAttractapInstallationStore } from './typeorm-installation.store';
import { TypeOrmAttractapReaderStore } from './typeorm-reader.store';
import { TypeOrmAttractapResourceReads } from './typeorm-resource-reads';
import { TypeOrmAttractapSecureBootKeyStore } from './typeorm-secure-boot-key.store';

/** The TypeORM-backed implementations of the Attractap persistence ports. */
@Module({
  imports: [
    PersistenceCoreModule,
    TypeOrmModule.forFeature([
      Attractap,
      AttractapCrashReport,
      AttractapCredentialEvent,
      AttractapInstallation,
      AttractapSecureBootKey,
      NFCCard,
      NFCCardPendingChange,
      Resource,
      ResourceUsage,
    ]),
  ],
  providers: [
    { provide: ATTRACTAP_READER_STORE, useClass: TypeOrmAttractapReaderStore },
    { provide: ATTRACTAP_CRASH_REPORT_STORE, useClass: TypeOrmAttractapCrashReportStore },
    { provide: ATTRACTAP_CREDENTIAL_STORE, useClass: TypeOrmAttractapCredentialStore },
    { provide: ATTRACTAP_SECURE_BOOT_KEY_STORE, useClass: TypeOrmAttractapSecureBootKeyStore },
    { provide: ATTRACTAP_INSTALLATION_STORE, useClass: TypeOrmAttractapInstallationStore },
    { provide: ATTRACTAP_CARD_STORE, useClass: TypeOrmAttractapCardStore },
    { provide: ATTRACTAP_RESOURCE_READS, useClass: TypeOrmAttractapResourceReads },
  ],
  exports: [
    ATTRACTAP_READER_STORE,
    ATTRACTAP_CRASH_REPORT_STORE,
    ATTRACTAP_CREDENTIAL_STORE,
    ATTRACTAP_SECURE_BOOT_KEY_STORE,
    ATTRACTAP_INSTALLATION_STORE,
    ATTRACTAP_CARD_STORE,
    ATTRACTAP_RESOURCE_READS,
  ],
})
export class AttractapPersistenceModule {}
