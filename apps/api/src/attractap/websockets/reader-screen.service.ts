import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ClusterService } from '../../cluster/cluster.service';
import { orServiceUnavailable } from '../../cluster/valkey-call';

/** The flows that own a reader's screen or card flow; one at a time per reader, cluster-wide. */
export type ReaderScreenFlow = 'mass-introduction' | 'supervision' | 'enrollment' | 'reset';

/** The claim value: names the flow, so any instance that knows the flow can release it. */
export function screenOwner(flow: ReaderScreenFlow, flowId: string): string {
  return `${flow}:${flowId}`;
}

function parseOwner(owner: string): { flow: ReaderScreenFlow; flowId: string } | null {
  const separator = owner.indexOf(':');
  if (separator < 0) return null;
  return { flow: owner.slice(0, separator) as ReaderScreenFlow, flowId: owner.slice(separator + 1) };
}

type LostHandler = (readerId: number, flowId: string) => Promise<void> | void;

/**
 * Cluster-wide reader screen claims (ATT-1163). The busy checks of the flows that own a reader's screen take one
 * before arming, so two instances cannot arm the same reader at once; each socket's state stays the instance's
 * local view. Without Valkey every claim succeeds and the socket state alone decides, as before.
 *
 * When an instance dies, the readers only it held lose their claim, and the flow learns its reader is gone.
 */
@Injectable()
export class ReaderScreenService implements OnModuleInit {
  private readonly logger = new Logger(ReaderScreenService.name);
  private readonly lostHandlers = new Map<ReaderScreenFlow, LostHandler>();
  readonly cluster: ClusterService;

  constructor(@Optional() cluster?: ClusterService) {
    this.cluster = cluster ?? ClusterService.local();
  }

  onModuleInit(): void {
    this.cluster.presence.onReaderLost((readerId) => this.readerLost(readerId));
  }

  /** Takes the reader for `owner`; false when another flow holds it. 503 while Valkey is unreachable. */
  claim(readerId: number, owner: string, ttlMs: number): Promise<boolean> {
    return orServiceUnavailable(this.cluster.claims.claim(readerId, owner, ttlMs));
  }

  /** Never throws; a claim that cannot be released lapses with its TTL. */
  release(readerId: number, owner: string | undefined): void {
    if (!owner || !this.cluster.enabled) return;
    void this.cluster.claims.release(readerId, owner);
  }

  /** The flow learns that its reader is gone everywhere (its only instance died). */
  onLost(flow: ReaderScreenFlow, handler: LostHandler): void {
    this.lostHandlers.set(flow, handler);
  }

  async readerLost(readerId: number): Promise<void> {
    const owner = await this.cluster.claims.forceRelease(readerId);
    const parsed = owner ? parseOwner(owner) : null;
    if (!parsed) return;
    this.logger.log(`Reader ${readerId} is gone with its instance; ending its ${parsed.flow} flow`);
    await this.lostHandlers.get(parsed.flow)?.(readerId, parsed.flowId);
  }
}
