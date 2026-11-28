import type { UsageSession } from '@attraccess/application-models';

/** Who asks for or approves a supervised session. */
export interface SupervisionUser {
  id: number;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Callbacks for a reader-originated supervision request. Unlike the web flow there is no blocking
 * HTTP caller — resolution side effects (notifying the reader websocket) run through these instead.
 */
export interface ReaderSupervisionCallbacks {
  onResolved: (session: UsageSession, supervisor: { id: number; username: string; displayName: string }) => void;
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
    requester: SupervisionUser;
    requestId: string;
  }): Promise<ReaderSupervisionCallbacks>;

  /**
   * Returns the reader to normal after its request ended without the callbacks `arm` returned, because the instance
   * holding them is gone (ATT-1163). Never throws.
   */
  disarm?(params: { readerId: number; requestId: string; error: Error }): void;
}
