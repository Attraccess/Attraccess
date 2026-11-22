// The in-memory commissioning session of the plugin and its REST view. Sessions hold no secret: the setup code goes to
// the sidecar in the request that starts the session and is never kept (ATT-1002 decisions 7 and 17).
import type { CommissioningSession } from '@attraccess/matter-contract';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import type { PLUGIN_FAILURE_CODES } from '../connection/audit';
import type { LifecycleState } from '../devices/entities';

export type SessionState = 'pending' | 'running' | 'succeeded' | 'failed' | 'interrupted';
export type SidecarStep = NonNullable<CommissioningSession['step']>;
/** The sidecar's failure codes, plus the two the plugin adds when it cannot agree with a successful sidecar. */
export type FailureCode = NonNullable<CommissioningSession['failure']>['code'] | (typeof PLUGIN_FAILURE_CODES)[number];
/** What an administrator can do about a device that already is in the fabric. */
export type ExistingAction = 'open' | 'repair' | 'restore' | 'reconcile';

export type SessionFailure = {
  code: FailureCode;
  attestationFindings?: string[];
  existing?: { nodeRecordId: string | null; lifecycleState: LifecycleState | null; action: ExistingAction };
};

export type SessionEndpoint = { endpointId: number; id: string; displayName: string | null };

export type Session = {
  id: string;
  userId: number;
  principal: PluginAuditPrincipal;
  state: SessionState;
  step: SidecarStep | null;
  failure: SessionFailure | null;
  attestation: CommissioningSession['attestation'];
  overrideRequested: boolean;
  overrideAvailable: boolean;
  nodeRecordId: string | null;
  endpoints: SessionEndpoint[];
  finished: boolean;
  /** Set while the naming step writes, so a second request cannot write and audit it again. */
  finishing: boolean;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  sidecarSessionId: string;
  /** The sidecar run the session started in; another one later means the sidecar restarted. */
  streamInstanceId: string | null;
  /** Set once the terminal outcome is being handled, so it is handled once. */
  settling: boolean;
  /** Polls in a row that could not reach the sidecar. */
  unreachable: number;
};

export const isActive = (session: Session): boolean => session.state === 'pending' || session.state === 'running';

/** The REST view of a session (`CommissioningSessionView` of the API spec). */
export function sessionView(session: Session) {
  return {
    id: session.id,
    state: session.state,
    step: session.step,
    failure: session.failure,
    attestation: session.attestation,
    overrideAvailable: session.overrideAvailable,
    nodeRecordId: session.nodeRecordId,
    endpoints: session.state === 'succeeded' ? session.endpoints : [],
    finished: session.finished,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    finishedAt: session.finishedAt,
  };
}
export type SessionView = ReturnType<typeof sessionView>;
