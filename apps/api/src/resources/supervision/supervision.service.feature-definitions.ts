import { ResourceUsage, User } from '@attraccess/database-entities';
import { StartUsageSessionDto } from '../usage/dtos/startUsageSession.dto';
export interface PendingSupervisionRequest {
  id: string;
  resourceId: number;
  requester: User;
  /**
   * The single supervisor whose approval is required (web flow, ATT-487), or `null` for a
   * reader-originated request (ATT-493) that any currently authorized introducer may approve — by
   * tapping their card at the reader or approving the web popup.
   */
  supervisorUserId: number | null;
  /** Supervisors the request was broadcast to (reader flow); used to fan out resolution/expiry events. */
  eligibleSupervisorIds: number[];
  dto: StartUsageSessionDto;
  createdAt: Date;
  expiresAt: Date;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (session: ResourceUsage) => void;
  reject: (error: Error) => void;
  settled: boolean;
  /** Present for reader-originated requests (ATT-493); drives reader-websocket notifications. */
  readerCallbacks?: ReaderSupervisionCallbacks;
  /**
   * The reader this request armed from the web (ATT-816). Set synchronously at registration, before
   * arming, so the one-armed-reader-per-requester scan sees concurrent requests.
   */
  readerId?: number;
}

/**
 * Callbacks for a reader-originated supervision request. Unlike the web flow there is no blocking
 * HTTP caller — resolution side effects (notifying the reader websocket) run through these instead.
 */
export interface ReaderSupervisionCallbacks {
  onResolved: (session: ResourceUsage, supervisor: { id: number; username: string }) => void;
  onFailed: (error: Error) => void;
}

/**
 * Port for arming a reader to wait for a supervisor card on behalf of a web requester (ATT-816).
 *
 * Implemented in the Attractap module and registered via {@link SupervisionService.setReaderArmer}.
 * A registration hook rather than an injected dependency, because the Attractap module already
 * depends on this service — injecting the gateway here would close the cycle.
 */
export interface ReaderSupervisionArmer {
  /**
   * Puts the reader into its supervisor-card wait state. Throws if the reader is unknown, offline
   * or busy with another flow, so the requester fails fast instead of watching a doomed countdown.
   * Returns the callbacks that report the request's outcome back to that reader.
   */
  arm(params: {
    readerId: number;
    resourceId: number;
    requester: User;
    requestId: string;
  }): Promise<ReaderSupervisionCallbacks>;
}
