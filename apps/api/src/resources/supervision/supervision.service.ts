import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { SupervisionCompletionImplementation } from './supervision-completion';
import { SupervisionLiveService } from './supervision-live.service';
import { PendingSupervisionRequest, ReaderSupervisionArmer } from './supervision.service.feature-definitions';

/**
 * Manages the short-lived, in-memory supervised-session approval lifecycle.
 *
 * A request is created when a user asks for a supervised session and selects a supervisor. It is
 * delivered to the supervisor in realtime (SSE) and lapses automatically after 30 seconds. The
 * requester's call resolves with the started session on approval, or rejects on timeout/rejection.
 *
 * No persistent entity is used — multiple parallel requests per supervisor are allowed without limit.
 */
@Injectable()
export class SupervisionService extends SupervisionCompletionImplementation {
  /** A pending request lapses this many milliseconds after creation. */
  public static readonly APPROVAL_TTL_MS = 30_000;

  protected readonly logger = new Logger(SupervisionService.name);
  protected readonly pending = new Map<string, PendingSupervisionRequest>();
  protected readerArmer: ReaderSupervisionArmer | null = null;

  constructor(
    protected readonly resourceUsageService: ResourceUsageService,
    protected readonly resourceIntroducersService: ResourceIntroducersService,
    protected readonly supervisionLive: SupervisionLiveService,
    protected readonly audit: AuditService,
  ) {
    super();
  }

  /** Registered by the Attractap module at startup; see {@link ReaderSupervisionArmer}. */
  public setReaderArmer(armer: ReaderSupervisionArmer): void {
    this.readerArmer = armer;
  }
}

export { ReaderSupervisionArmer, ReaderSupervisionCallbacks } from './supervision.service.feature-definitions';
