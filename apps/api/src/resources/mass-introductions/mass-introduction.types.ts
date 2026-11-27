import {
  MassIntroductionMethod,
  MassIntroductionReaderState,
  MassIntroductionTargetType,
} from './dtos/massIntroductionSession.dto';
import { MassIntroductionEndReason } from './dtos/massIntroductionLiveEvent.dto';
import type { AuthenticationMethod } from '@attraccess/application-models';

export interface MassIntroductionTarget {
  type: MassIntroductionTargetType;
  id: number;
  name: string;
}

export interface MassIntroductionParticipant {
  userId: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  method: MassIntroductionMethod;
  alreadyIntroduced: boolean;
  joinedAt: Date;
}

export interface MassIntroductionIntroducer {
  id: number;
  username: string;
  displayName: string;
  authenticationMethod: AuthenticationMethod | null;
  apiTokenId: number | null;
  /**
   * Authorized through the `resources.access.manage` permission rather than an introducer role.
   * Permissions cannot be re-resolved without the request, so only role-based sessions are
   * re-checked when a participant joins.
   */
  viaPermission: boolean;
}

export interface MassIntroductionReader {
  id: number;
  name: string;
  state: MassIntroductionReaderState;
}

/**
 * Port for showing a mass-introduction scan screen on an Attractap reader.
 *
 * Implemented in the Attractap module and registered via
 * {@link MassIntroductionService.setReaderPort}, because the Attractap module already depends on
 * the resources modules — injecting the gateway here would close the cycle.
 */
export interface MassIntroductionReaderPort {
  /**
   * Shows the scan screen. Throws if the reader is unknown, offline, unsupported or busy, so the
   * introducer learns about it before handing out a QR code.
   */
  arm(params: {
    readerId: number;
    /** Only readers linked to one of these resources may be armed. */
    allowedResourceIds: number[];
    sessionId: string;
    targetName: string;
    introducerUsername: string;
    introducerDisplayName: string;
    expiresAt: Date;
  }): Promise<{ readerName: string }>;

  /** Returns the reader to its normal screen. Never throws. */
  disarm(params: { readerId: number; sessionId: string; reason: MassIntroductionEndReason }): void;
}
