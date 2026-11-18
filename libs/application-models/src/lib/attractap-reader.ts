import type { AutoIntroductionTarget, SupervisionMode } from './resource-supervision';
import type { DocumentationType } from './documentation-type';
import type { ResourceType } from './resource-type';

export type AttractapPairingState = 'unpaired' | 'paired' | 'revoked';

/** Firmware build profile a reader reports: plain, release secure or the lab's development-mode secure build. */
export const ATTRACTAP_FIRMWARE_PROFILES = ['plain', 'secure', 'secure-lab'] as const;
export type AttractapFirmwareProfile = (typeof ATTRACTAP_FIRMWARE_PROFILES)[number];

/** What the reader firmware can do, as reported by the reader. */
export interface AttractapReaderCapabilities {
  resourceSelection: boolean;
  resourceActionSelection: boolean;
  cardEnrollment: boolean;
  hasLeds: boolean;
  cardRelay: boolean;
  /** Reader UI capabilities; null means schema version 0 (no plugin UI). */
  ui: Record<string, unknown> | null;
  resetReason: string | null;
}

export interface AttractapFirmwareInfo {
  name: string | null;
  variant: string | null;
  version: string | null;
  capabilities: AttractapReaderCapabilities;
}

/** A resource as it is linked to a reader: the resource's own columns, without its relations. */
export interface AttractapLinkedResource {
  id: number;
  name: string;
  type: ResourceType;
  separateUnlockAndUnlatch: boolean | null;
  description: string | null;
  imageFilename: string | null;
  documentationType: DocumentationType | null;
  documentationMarkdown: string | null;
  documentationUrl: string | null;
  metadata: Record<string, unknown> | null;
  allowTakeOver: boolean;
  maxParallelSessions: number;
  retrainingMaxAgeDays: number | null;
  retrainingMaxInactivityDays: number | null;
  retrainingBlocksAccess: boolean;
  supervisionMode: SupervisionMode;
  supervisedUsagesUntilIntroduction: number | null;
  autoIntroductionTarget: AutoIntroductionTarget | null;
  autoIntroductionGroupId: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** An Attractap reader. `apiTokenHash` is internal: it never belongs in a response. */
export interface AttractapReader {
  id: number;
  name: string;
  apiTokenHash: string;
  pairingState: AttractapPairingState;
  credentialFingerprint: string | null;
  secureBootDigest0: string | null;
  secureBootDigest1: string | null;
  secureBootSignerDigest: string | null;
  pairedAt: Date | null;
  certificateNotAfter: Date | null;
  certificateSerial: string | null;
  /** The server checked the reader's eFuse report against the secure profile (never the reader's own claim). */
  secured: boolean;
  securedAt: Date | null;
  /** Profile the reader reported in its firmware info; a claim, not attestation. */
  firmwareProfile: AttractapFirmwareProfile | null;
  /** The app's secure_version as the reader reported it. */
  secureVersion: number | null;
  /** The eFuse SECURE_VERSION from the reader's last eFuse report. */
  efuseSecureVersion: number | null;
  securityReportCheckedAt: Date | null;
  /** Problem codes of the last eFuse report check; empty when it passed, null when none was received. */
  securityReportProblems: string[] | null;
  /** Present only when the read asked for the linked resources. */
  resources?: AttractapLinkedResource[];
  lastConnection: Date;
  firstConnection: Date;
  ledBrightness: number;
  /** Whether backend plugins with the BLE_TRANSPORT permission may use this reader's Bluetooth radio. */
  allowPluginBle: boolean;
  firmware: AttractapFirmwareInfo;
}

/** The security columns the server writes on its own (firmware info, eFuse report); never part of an edit. */
export interface AttractapReaderSecurityPatch {
  secured?: boolean;
  securedAt?: Date | null;
  firmwareProfile?: AttractapFirmwareProfile | null;
  secureVersion?: number | null;
  efuseSecureVersion?: number | null;
  securityReportCheckedAt?: Date | null;
  securityReportProblems?: string[] | null;
}

/** A reader read together with its linked resources. */
export type AttractapReaderWithResources = AttractapReader & { resources: AttractapLinkedResource[] };

/** The credential columns of a reader row, so a pairing can be undone. */
export interface AttractapCredentialSnapshot {
  pairingState: AttractapPairingState;
  credentialFingerprint: string | null;
  pairedAt: Date | null;
  certificateNotAfter: Date | null;
  certificateSerial: string | null;
  apiTokenHash: string;
}

/** The reader fields an administrator or the reader itself may change; credentials are never part of it. */
export interface AttractapReaderEdit {
  name?: string;
  ledBrightness?: number;
  allowPluginBle?: boolean;
  firmware?: AttractapFirmwareInfo;
  /** Replaces the linked resources. */
  resourceIds?: number[];
}

/** Narrowing for reader lists. */
export interface AttractapReaderFilter {
  /** Only readers linked to this resource. */
  resourceId?: number;
  /** Only readers linked to any resource of this group. */
  resourceGroupId?: number;
  /** Only readers whose pairing state is paired (true) or is not paired (false). */
  paired?: boolean;
  /** Load the linked resources. */
  withResources?: boolean;
}

export type AttractapCredentialEventState = 'paired' | 'revoked' | 'replaced';

/** Append-only credential history entry. */
export interface AttractapCredentialEventRecord {
  id: number;
  readerId: number;
  readerName: string;
  keyFingerprint: string;
  certificateSerial: string | null;
  state: AttractapCredentialEventState;
  actorId: number | null;
  createdAt: Date;
}
