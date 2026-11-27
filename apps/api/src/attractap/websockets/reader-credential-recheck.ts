import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CredentialRegistryService } from '../security/credential-registry.service';
import { CREDENTIAL_CHANGED_EVENT } from '../security/pairing-model';
import { remoteEvent } from './reader-event-relay';
import { ReaderRouter } from './reader-router';
import { WebsocketService } from './websocket.service';

/** How often the credentials of the readers this instance holds are checked again. */
export const CREDENTIAL_RECHECK_EVERY_MS = 30_000;

/**
 * With several API instances a revoke or re-pair made on another one reaches this one as a pub/sub message, which
 * is lost when a Valkey connection drops at that moment (ATT-1163). So the credential of every reader socket held
 * here is checked against the database now and then; one that is no longer active ends as the message would have
 * ended it. Without Valkey every change is made in this process and nothing needs checking.
 */
@Injectable()
export class ReaderCredentialRecheck implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReaderCredentialRecheck.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly websocketService: WebsocketService,
    private readonly registry: CredentialRegistryService,
    private readonly router: ReaderRouter,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit(): void {
    if (!this.router.cluster.enabled) return;
    this.timer = setInterval(() => void this.recheck(), CREDENTIAL_RECHECK_EVERY_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Exposed for tests: one check of every held reader socket. */
  async recheck(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const held = new Map<number, Set<string>>();
      for (const socket of this.websocketService.sockets.values()) {
        const security = socket.sessionSecurity;
        if (socket.readerId == null || !security) continue;
        const fingerprints = held.get(socket.readerId) ?? new Set<string>();
        fingerprints.add(security.fingerprint);
        held.set(socket.readerId, fingerprints);
      }
      for (const [readerId, fingerprints] of held) {
        try {
          const current = await this.registry.currentNow(readerId);
          const active = (fingerprint: string) => current?.state === 'paired' && current.fingerprint === fingerprint;
          if ([...fingerprints].every(active)) continue;
          this.logger.warn(`Reader ${readerId} holds a credential that is no longer active; disconnecting it`);
          // Handled as a change relayed from another instance: the cache is cleared and the sockets end here.
          this.events.emit(remoteEvent(CREDENTIAL_CHANGED_EVENT), readerId);
        } catch (error) {
          this.logger.warn(`Could not check the credential of reader ${readerId}: ${(error as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
