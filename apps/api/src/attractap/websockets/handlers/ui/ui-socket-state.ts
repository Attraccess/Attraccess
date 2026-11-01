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
  /** The last message for this contribution carried a tree, so the reader may still show it. */
  sent: boolean;
  /** Built while a card session was live, so it may show user-specific content. */
  userScoped: boolean;
}

/** Minimal limiter surface, so this file does not depend on the limiter implementation. */
export interface UiSlotLimiter {
  take(key: string, now: number): number;
}

export interface UiSlotsState {
  capabilities: ReaderUiCapabilities | null;
  /** Latest message id per contribution key, so a newer revision supersedes a pending retry. */
  inflight: Map<string, number>;
  /** Last revision per contribution key for the whole connection: a re-add continues, never restarts at 1. */
  revisions: Map<string, number>;
  contributions: Map<string, UiContributionRecord>;
  /** Resource ids of the reader, null until loaded. Refreshed when the reader is updated. */
  resourceIds: number[] | null;
  /** `plugin|resourceId` of provider calls that have not settled yet (even after their timeout). */
  pendingProviders: Set<string>;
  /** Rate limit windows of this connection only. */
  limiter: UiSlotLimiter;
  timers: Map<string, NodeJS.Timeout>;
  flushTimer: NodeJS.Timeout | null;
  /** Coalesces plugin invalidations into one sync. */
  invalidateTimer: NodeJS.Timeout | null;
  syncing: boolean;
  /** Set while a sync is running and another was requested. */
  resync: boolean;
  /** The next sync replaces or removes user-scoped content without waiting for the rate limit (sign-in/out). */
  privacyFlush: boolean;
}

export function contributionKey(resourceId: number, slot: string, plugin: string, key: string): string {
  return `${resourceId}|${slot}|${plugin}|${key}`;
}
