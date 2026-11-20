import { PLUGIN_READER_LIMITS } from '@attraccess/plugins-backend-sdk';
import { Injectable, Logger } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { randomBytes } from 'crypto';

/** What a successful `cards.authenticate` proved: this card of this user was held to this plugin device. */
export interface PluginCardAuthentication {
  pluginId: string;
  device: string;
  cardId: number;
  userId: number;
  /** `Date.now()` at issue. */
  issuedAt: number;
}

export const PLUGIN_CARD_AUTHENTICATION_LIMITS = {
  /** Handles kept at once; the oldest goes first. */
  maxPending: 1000,
  /** Expired handles are kept this long so a late tap learns it expired rather than that it is unknown. */
  retainMs: 4 * PLUGIN_READER_LIMITS.authenticationTtlMs,
} as const;

/**
 * The single-use handles `cards.authenticate` hands out as `card.authentication` and `readers.tap` consumes.
 * In memory only: a restart invalidates them, as it ends every card conversation. A handle is never logged.
 */
@Injectable()
export class PluginCardAuthentications {
  /** Insertion order is issue order, so the first entry is the oldest. */
  private readonly pending = new Map<string, PluginCardAuthentication>();
  /** Overridable for tests. */
  public now: () => number = () => Date.now();

  /** An opaque 256-bit base64url handle bound to the authentication. */
  issue(authentication: Omit<PluginCardAuthentication, 'issuedAt'>): string {
    const now = this.now();
    for (const [handle, entry] of this.pending) {
      if (now - entry.issuedAt <= PLUGIN_CARD_AUTHENTICATION_LIMITS.retainMs) break;
      this.pending.delete(handle);
    }
    while (this.pending.size >= PLUGIN_CARD_AUTHENTICATION_LIMITS.maxPending) {
      this.pending.delete(this.pending.keys().next().value as string);
    }
    const handle = randomBytes(32).toString('base64url');
    this.pending.set(handle, { ...authentication, issuedAt: now });
    return handle;
  }

  /** Removes the handle and returns what it was bound to, or null for an unknown or already used one. */
  consume(handle: string): PluginCardAuthentication | null {
    const entry = this.pending.get(handle);
    if (!entry) return null;
    this.pending.delete(handle);
    return entry;
  }

  /** Whether the authentication is older than `PLUGIN_READER_LIMITS.authenticationTtlMs`. */
  isExpired(authentication: PluginCardAuthentication): boolean {
    return this.now() - authentication.issuedAt > PLUGIN_READER_LIMITS.authenticationTtlMs;
  }

  /** The plugin module is destroyed: its pending handles go with it. */
  dropPlugin(pluginId: string): void {
    for (const [handle, entry] of this.pending) {
      if (entry.pluginId === pluginId) this.pending.delete(handle);
    }
  }

  get size(): number {
    return this.pending.size;
  }
}

const logger = new Logger('PluginModule');

/** Unload hook: drops the plugin's pending handles. A plugin that never got host refs has none. Never throws. */
export function dropPluginCardAuthentications(moduleRef: ModuleRef | null, pluginId: string): void {
  if (!moduleRef) return;
  try {
    moduleRef.get(PluginCardAuthentications, { strict: false }).dropPlugin(pluginId);
  } catch (error) {
    logger.warn(`Dropping card authentications of plugin ${pluginId} failed: ${(error as Error).message}`);
  }
}
