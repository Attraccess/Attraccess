// The commissioning REST API (`/api/matter/commissioning`). Setup codes travel only in POST bodies, and are never part
// of a URL, a query or a cache key. Types mirror the backend views. Removal and sharing live in devices/api.ts.
import type { LifecycleState, MatterNodeSummary } from '../devices/api';
import { matterRequest } from '../matterApi';

export const SESSION_STEPS = [
  'discovering',
  'pase',
  'reading_device',
  'attestation',
  'adding_fabric',
  'network_setup',
  'case',
  'interrogating',
  'completed',
] as const;
export type SessionStep = (typeof SESSION_STEPS)[number];
export type SessionState = 'pending' | 'running' | 'succeeded' | 'failed' | 'interrupted';
export type ExistingAction = 'open' | 'repair' | 'restore' | 'reconcile';

export interface SessionFailure {
  code: string;
  attestationFindings?: string[];
  existing?: { nodeRecordId: string | null; lifecycleState: LifecycleState | null; action: ExistingAction };
}

export interface CommissioningSessionView {
  id: string;
  state: SessionState;
  step: SessionStep | null;
  failure: SessionFailure | null;
  attestation: { status: 'verified' | 'failed' | 'overridden'; findings: string[] } | null;
  overrideAvailable: boolean;
  nodeRecordId: string | null;
  endpoints: { endpointId: number; id: string; displayName: string | null }[];
  finished: boolean;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export const isActive = (session: Pick<CommissioningSessionView, 'state'>): boolean =>
  session.state === 'pending' || session.state === 'running';

export interface StartRequest {
  setupCode: string;
  attestationOverride?: { confirmed: true };
}
export interface FinishRequest {
  displayName?: string;
  location?: string;
  endpoints?: { id: string; displayName: string }[];
}

const call = matterRequest;
const session = (id: string) => `/commissioning/sessions/${encodeURIComponent(id)}`;

export const startCommissioning = (request: StartRequest) =>
  call<CommissioningSessionView>('POST', '/commissioning/sessions', request);
export const getCurrentSession = () => call<CommissioningSessionView | null>('GET', '/commissioning/sessions/current');
export const getSession = (id: string) => call<CommissioningSessionView>('GET', session(id));
export const cancelSession = (id: string) => call<CommissioningSessionView>('DELETE', session(id));
export const finishSession = (id: string, request: FinishRequest) =>
  call<{ node: MatterNodeSummary }>('POST', `${session(id)}/finish`, request);
