// The commissioning REST API (`/api/matter/commissioning`, node removal and sharing). Setup and sharing codes travel
// only in POST bodies, and are never part of a URL, a query or a cache key. Types mirror the backend views.
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import type { LifecycleState, MatterNodeSummary } from '../devices/api';

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

/** A failed request, with the machine-readable `code` of the backend when it sent one. */
export class MatterApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'MatterApiError';
  }
}

const client = createPluginApiClient('/api/matter');

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await client.fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: { message?: string | string[]; code?: string } | null = null;
  try {
    parsed = text === '' ? null : (JSON.parse(text) as typeof parsed);
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const message = Array.isArray(parsed?.message) ? parsed.message.join(' ') : parsed?.message;
    throw new MatterApiError(
      message || `Request failed (HTTP ${response.status}).`,
      response.status,
      parsed?.code ?? null,
    );
  }
  return parsed as T;
}

export interface StartRequest {
  setupCode: string;
  attestationOverride?: { confirmed: true };
}
export interface FinishRequest {
  displayName?: string;
  location?: string;
  endpoints?: { id: string; displayName: string }[];
}
export interface ShareWindow {
  manualCode: string;
  qrCode: string;
  expiresAt: string;
}

const session = (id: string) => `/commissioning/sessions/${encodeURIComponent(id)}`;
const node = (id: string) => `/nodes/${encodeURIComponent(id)}`;

export const startCommissioning = (request: StartRequest) =>
  call<CommissioningSessionView>('POST', '/commissioning/sessions', request);
export const getCurrentSession = () => call<CommissioningSessionView | null>('GET', '/commissioning/sessions/current');
export const getSession = (id: string) => call<CommissioningSessionView>('GET', session(id));
export const cancelSession = (id: string) => call<CommissioningSessionView>('DELETE', session(id));
export const finishSession = (id: string, request: FinishRequest) =>
  call<{ node: MatterNodeSummary }>('POST', `${session(id)}/finish`, request);

export const removeFromFabric = (id: string, mode: 'normal' | 'force') =>
  call<MatterNodeSummary>('POST', `${node(id)}/remove`, { mode, confirm: true });
export const openShareWindow = (id: string, timeoutSec?: number) =>
  call<ShareWindow>('POST', `${node(id)}/share`, timeoutSec === undefined ? {} : { timeoutSec });
export const closeShareWindow = (id: string) => call<{ closed: boolean }>('DELETE', `${node(id)}/share`);
