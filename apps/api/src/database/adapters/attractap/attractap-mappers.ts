import {
  Attractap,
  AttractapCrashReport,
  AttractapCredentialEvent,
  AttractapInstallation,
  AttractapSecureBootKey,
  NFCCard,
  NFCCardPendingChange,
  Resource,
  User,
} from '@attraccess/database-entities';
import type {
  AttractapCardOwner,
  AttractapCrashReportRecord,
  AttractapCredentialEventRecord,
  AttractapFirmwareInfo,
  AttractapInstallationRecord,
  AttractapLinkedResource,
  AttractapNfcCard,
  AttractapNfcCardPendingChange,
  AttractapReader,
  AttractapSecureBootKeyRecord,
} from '@attraccess/application-models';

export function toLinkedResource(resource: Resource): AttractapLinkedResource {
  return {
    id: resource.id,
    name: resource.name,
    type: resource.type,
    separateUnlockAndUnlatch: resource.separateUnlockAndUnlatch,
    accessOnly: resource.accessOnly,
    description: resource.description,
    imageFilename: resource.imageFilename,
    documentationType: resource.documentationType,
    documentationMarkdown: resource.documentationMarkdown,
    documentationUrl: resource.documentationUrl,
    metadata: resource.metadata,
    allowTakeOver: resource.allowTakeOver,
    maxParallelSessions: resource.maxParallelSessions,
    retrainingMaxAgeDays: resource.retrainingMaxAgeDays,
    retrainingMaxInactivityDays: resource.retrainingMaxInactivityDays,
    retrainingBlocksAccess: resource.retrainingBlocksAccess,
    supervisionMode: resource.supervisionMode,
    supervisedUsagesUntilIntroduction: resource.supervisedUsagesUntilIntroduction,
    autoIntroductionTarget: resource.autoIntroductionTarget,
    autoIntroductionGroupId: resource.autoIntroductionGroupId,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
    deletedAt: resource.deletedAt,
  };
}

export function toFirmwareInfo(firmware: Attractap['firmware']): AttractapFirmwareInfo {
  const capabilities = firmware?.capabilities;
  return {
    name: firmware?.name ?? null,
    variant: firmware?.variant ?? null,
    version: firmware?.version ?? null,
    capabilities: {
      nfc: capabilities?.nfc,
      resourceSelection: capabilities?.resourceSelection,
      resourceActionSelection: capabilities?.resourceActionSelection,
      cardEnrollment: capabilities?.cardEnrollment,
      hasLeds: capabilities?.hasLeds,
      cardRelay: capabilities?.cardRelay,
      ui: capabilities?.ui ?? null,
      resetReason: capabilities?.resetReason ?? null,
    },
  };
}

export function toReader(reader: Attractap): AttractapReader {
  return {
    id: reader.id,
    name: reader.name,
    pairingState: reader.pairingState,
    credentialFingerprint: reader.credentialFingerprint,
    secureBootDigest0: reader.secureBootDigest0,
    secureBootDigest1: reader.secureBootDigest1,
    secureBootSignerDigest: reader.secureBootSignerDigest,
    pairedAt: reader.pairedAt,
    certificateNotAfter: reader.certificateNotAfter,
    certificateSerial: reader.certificateSerial,
    secured: reader.secured ?? false,
    securedAt: reader.securedAt ?? null,
    firmwareProfile: reader.firmwareProfile ?? null,
    secureVersion: reader.secureVersion ?? null,
    efuseSecureVersion: reader.efuseSecureVersion ?? null,
    securityReportCheckedAt: reader.securityReportCheckedAt ?? null,
    securityReportProblems: reader.securityReportProblems ?? null,
    // Absent unless the query loaded the relation, as before.
    ...(reader.resources ? { resources: reader.resources.map(toLinkedResource) } : {}),
    lastConnection: reader.lastConnection,
    firstConnection: reader.firstConnection,
    ledBrightness: reader.ledBrightness,
    allowPluginBle: reader.allowPluginBle,
    firmware: toFirmwareInfo(reader.firmware),
  };
}

/** The user fields a card owner is built from; a user row and the application's user record both carry them. */
type CardOwnerSource = Pick<
  User,
  | 'id'
  | 'username'
  | 'email'
  | 'locale'
  | 'dateTimeLocale'
  | 'isEmailVerified'
  | 'isDisabled'
  | 'externalIdentifier'
  | 'createdAt'
  | 'updatedAt'
> & { deletedAt?: Date | null };

export function toCardOwner(user: CardOwnerSource): AttractapCardOwner {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    locale: user.locale,
    dateTimeLocale: user.dateTimeLocale,
    isEmailVerified: user.isEmailVerified,
    isDisabled: user.isDisabled,
    externalIdentifier: user.externalIdentifier,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ...(user.deletedAt !== undefined ? { deletedAt: user.deletedAt } : {}),
  };
}

export function toNfcCard(card: NFCCard): AttractapNfcCard {
  return {
    id: card.id,
    uid: card.uid,
    keyNo: card.keyNo,
    key: card.key,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    lastSeen: card.lastSeen,
    isActive: card.isActive,
    ...(card.user ? { user: toCardOwner(card.user) } : {}),
  };
}

export function toPendingChange(change: NFCCardPendingChange): AttractapNfcCardPendingChange {
  return {
    id: change.id,
    uid: change.uid,
    kind: change.kind,
    userId: change.userId,
    cardId: change.cardId,
    keyNo: change.keyNo,
    key: change.key,
    actorId: change.actorId,
    createdAt: change.createdAt,
  };
}

export function toCrashReport(report: AttractapCrashReport): AttractapCrashReportRecord {
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
    coredumpSize: report.coredumpSize,
    coredump: report.coredump ?? null,
    coredumpStatus: report.coredumpStatus ?? null,
    coredumpExpectedSize: report.coredumpExpectedSize ?? null,
    coredumpExpectedCrc32: report.coredumpExpectedCrc32 ?? null,
    coredumpBuildId: report.coredumpBuildId,
    symbolicationStatus: report.symbolicationStatus,
    symbolizedBacktrace: report.symbolizedBacktrace,
    createdAt: report.createdAt,
  };
}

export function toCredentialEvent(event: AttractapCredentialEvent): AttractapCredentialEventRecord {
  return {
    id: event.id,
    readerId: event.readerId,
    readerName: event.readerName,
    keyFingerprint: event.keyFingerprint,
    certificateSerial: event.certificateSerial,
    state: event.state,
    actorId: event.actorId,
    createdAt: event.createdAt,
  };
}

export function toSecureBootKey(key: AttractapSecureBootKey): AttractapSecureBootKeyRecord {
  return {
    id: key.id,
    role: key.role,
    publicKeyPem: key.publicKeyPem,
    digest: key.digest,
    fingerprint: key.fingerprint,
    privateKeyEncrypted: key.privateKeyEncrypted,
    verifiedAt: key.verifiedAt,
    restoredAt: key.restoredAt,
    createdAt: key.createdAt,
  };
}

export function toInstallation(row: AttractapInstallation): AttractapInstallationRecord {
  return {
    installationId: row.installationId,
    caCertificatePem: row.caCertificatePem,
    caPrivateKeyEncrypted: row.caPrivateKeyEncrypted,
    serverCertificatePem: row.serverCertificatePem,
    serverPrivateKeyEncrypted: row.serverPrivateKeyEncrypted,
    serverCertificateNotAfter: row.serverCertificateNotAfter,
  };
}
