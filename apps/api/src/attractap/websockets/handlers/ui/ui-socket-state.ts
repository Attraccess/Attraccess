import type { PluginChoice, PluginConfirmation, ReaderUiCapabilities } from '@attraccess/plugins-backend-sdk';

/** One card authentication on a reader. Steps and user-scoped slots are bound to it. */
export interface CardSessionState {
  id: string;
  userId: number;
  language: 'en' | 'de';
  issuedAt: number;
  expiryTimer: NodeJS.Timeout | null;
}

export type UiStepKind = 'start' | 'post-stop' | 'card-confirm';

export interface UiStepState {
  stepId: string;
  kind: UiStepKind;
  plugin: string;
  stepKey: string;
  requestId: number;
  readerId: number;
  cardSessionId: string;
  userId: number;
  resourceId: number;
  action: 'start' | 'takeover';
  projectId?: number;
  issuedAt: number;
  /** Epoch ms after which the answer is rejected (TTL plus grace). */
  deadline: number;
  /** Plugin step keys confirmed earlier in the same start attempt. */
  satisfied: Record<string, string[]>;
  confirmation?: PluginConfirmation;
  choice?: PluginChoice;
  timer: NodeJS.Timeout | null;
}

export interface UiContributionRecord {
  plugin: string;
  resourceId: number;
  slot: string;
  key: string;
  revision: number;
  hash: string;
  nodes: number;
  status: 'rendered' | 'degraded' | 'skipped';
  reason?: string;
  expiresAtMs?: number;
}

export interface UiSlotsState {
  capabilities: ReaderUiCapabilities | null;
  /** Latest message id per contribution key, so a newer revision supersedes a pending retry. */
  inflight: Map<string, number>;
  contributions: Map<string, UiContributionRecord>;
  timers: Map<string, NodeJS.Timeout>;
  flushTimer: NodeJS.Timeout | null;
  syncing: boolean;
  /** Set while a sync is running and another was requested. */
  resync: boolean;
}

export function contributionKey(resourceId: number, slot: string, plugin: string, key: string): string {
  return `${resourceId}|${slot}|${plugin}|${key}`;
}
