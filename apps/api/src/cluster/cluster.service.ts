import { Inject, Injectable, OnApplicationShutdown, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import type { ValkeyConfigType } from '../config/valkey.config';
import { resolveInstanceName } from '../resources/usage/sessions/session-change-coordination';
import { VALKEY_CLIENT } from '../valkey/valkey.module';
import { LocalClusterBus, ValkeyClusterBus } from './cluster-bus';
import { LocalClusterDeadlines, ValkeyClusterDeadlines } from './cluster-deadlines';
import { HEARTBEAT_EVERY_MS, LocalClusterInstances, newInstanceId, ValkeyClusterInstances } from './cluster-instances';
import type {
  ClusterBus,
  ClusterDeadlines,
  ClusterInstances,
  ReaderPresence,
  ReaderScreenClaims,
} from './cluster.types';
import { LocalReaderPresence, ValkeyReaderPresence } from './reader-presence';
import { LocalReaderScreenClaims, ValkeyReaderScreenClaims } from './reader-screen-claims';

/** Overrides for tests that run several instances in one process. */
export const CLUSTER_OPTIONS = 'CLUSTER_OPTIONS';
export interface ClusterOptions {
  instanceName?: string;
  /** Faster sweeps and heartbeats for tests. */
  timing?: { heartbeatEveryMs: number; sweepEveryMs: number; deadlineSweepEveryMs: number };
}

/**
 * The cluster as one API instance sees it (ATT-1163). `enabled` is true when Valkey is configured: then several
 * instances share presence, claims, deadlines and messages through it. Without Valkey this instance is the whole
 * cluster and every part keeps to the process, as before.
 */
@Injectable()
export class ClusterService implements OnModuleInit, OnApplicationShutdown {
  readonly enabled: boolean;
  readonly valkey: Redis | null;
  readonly instances: ClusterInstances;
  readonly bus: ClusterBus;
  readonly presence: ReaderPresence;
  readonly claims: ReaderScreenClaims;
  readonly deadlines: ClusterDeadlines;
  private resync: NodeJS.Timeout | null = null;
  private started = false;

  constructor(
    @Inject(VALKEY_CLIENT) valkey: Redis | null,
    @Optional() @Inject(CLUSTER_OPTIONS) private readonly options: ClusterOptions = {},
    @Optional() config?: ConfigService,
  ) {
    // The same name as the session-change locks (ATTRACCESS_INSTANCE_NAME, else `<hostname>:<PORT>`), per boot unique.
    const id = newInstanceId(
      options.instanceName ?? resolveInstanceName(config?.get<ValkeyConfigType>('valkey')?.ATTRACCESS_INSTANCE_NAME),
    );
    this.valkey = valkey;
    this.enabled = valkey !== null;
    if (!valkey) {
      this.instances = new LocalClusterInstances(id);
      this.bus = new LocalClusterBus(id);
      this.presence = new LocalReaderPresence(id);
      this.claims = new LocalReaderScreenClaims();
      this.deadlines = new LocalClusterDeadlines();
      return;
    }
    const timing = options.timing;
    const instances = new ValkeyClusterInstances(
      valkey,
      id,
      timing ? { heartbeatEveryMs: timing.heartbeatEveryMs, sweepEveryMs: timing.sweepEveryMs } : undefined,
    );
    this.instances = instances;
    this.bus = new ValkeyClusterBus(valkey, id, (instanceId) => instances.isAlive(instanceId));
    this.presence = new ValkeyReaderPresence(valkey, instances, this.bus);
    this.claims = new ValkeyReaderScreenClaims(valkey);
    this.deadlines = new ValkeyClusterDeadlines(valkey);
  }

  /** This process alone, for code constructed without Nest (and unit tests that provide no cluster). */
  static local(): ClusterService {
    return new ClusterService(null);
  }

  get instanceId(): string {
    return this.instances.id;
  }

  onModuleInit(): void {
    if (!this.enabled || this.started) return;
    this.started = true;
    (this.instances as ValkeyClusterInstances).start();
    (this.bus as ValkeyClusterBus).start();
    (this.deadlines as ValkeyClusterDeadlines).start(this.options.timing?.deadlineSweepEveryMs);
    this.resync = setInterval(
      () => void (this.presence as ValkeyReaderPresence).resync(),
      this.options.timing?.heartbeatEveryMs ?? HEARTBEAT_EVERY_MS,
    );
    this.resync.unref?.();
  }

  /** Resolves once this instance receives cluster messages (tests). */
  whenReady(): Promise<void> {
    return this.enabled ? (this.bus as ValkeyClusterBus).whenSubscribed() : Promise.resolve();
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.enabled) return;
    this.stopTimers();
    await (this.instances as ValkeyClusterInstances).stop();
  }

  /** Simulates a crash for tests: stops every timer and message without a goodbye. */
  halt(): void {
    if (!this.enabled) return;
    this.stopTimers();
    (this.instances as ValkeyClusterInstances).halt();
  }

  private stopTimers(): void {
    if (this.resync) clearInterval(this.resync);
    this.resync = null;
    (this.deadlines as ValkeyClusterDeadlines).stop();
    (this.bus as ValkeyClusterBus).stop();
  }
}
