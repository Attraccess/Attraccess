import type { OperationResponse } from '@attraccess/matter-contract';
import type { ClientNode } from '@matter/main';
import { ApiError } from '../api-error';
import type { FabricManager } from '../fabric/manager';
import type { FeatureHandlers } from '../request-pipeline';
import { commissionedPeers, findPeer, nodeIdOf, readAdministrators, requireController } from '../nodes/peers';
import { administratorsOf, describeNode, type Administrator, type EndpointLike, type InventoryNode } from './describe';
import { readAttestation, readAttestations, type AttestationRecord } from './node-meta';

/** How long one device may take to report its fabrics. */
const ADMINISTRATORS_TIMEOUT_MS = 3_000;
/** How long a list or get waits for live reads before it answers with what it knows. Reads go on in the background. */
const LIVE_READ_WAIT_MS = 4_000;
/** Live reads of administrators running at once, across all requests. */
const MAX_LIVE_READS = 8;

type Observed = { administrators: Administrator[]; observedAt: string };

/** A counting semaphore that hands a released slot straight to the next waiter, so the limit is never exceeded. */
function limiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (active < max) active += 1;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}

/**
 * The `inventory` operations: what the controller's commissioned peers look like, from the cache matter.js keeps. Only
 * the list of other administrators is read from the device (it is fabric-scoped, so the cache cannot hold it). Those
 * reads are limited to {@link MAX_LIVE_READS} at a time, one per node, and a request waits for them only briefly.
 */
export function inventoryHandlers(manager: FabricManager): FeatureHandlers {
  /** Last administrators and time a node answered, for nodes that are offline now. In memory only. */
  const lastObserved = new Map<string, Observed>();
  const inFlight = new Map<string, Promise<void>>();
  const limit = limiter(MAX_LIVE_READS);
  let knownFabricId: string | null = null;

  /** Drops what was observed of nodes that are no longer in the fabric; all of it when the fabric itself changed. */
  function prune(fabricId: string | null, present: ReadonlySet<string>) {
    if (fabricId !== knownFabricId) lastObserved.clear();
    knownFabricId = fabricId;
    for (const nodeId of lastObserved.keys()) if (!present.has(nodeId)) lastObserved.delete(nodeId);
  }
  const presentNodes = () => {
    const controller = manager.controller;
    return new Set(controller?.running ? commissionedPeers(controller).map((peer) => nodeIdOf(peer) as string) : []);
  };
  manager.onFabricChange((status) => prune(status.fabricId, presentNodes()));

  /** Starts a live read of the node's administrators, unless one is already running. Never rejects. */
  function observe(peer: ClientNode, nodeId: string): Promise<void> {
    const running = inFlight.get(nodeId);
    if (running) return running;
    const reading = limit(async () => {
      try {
        const administrators = await readAdministrators(peer, ADMINISTRATORS_TIMEOUT_MS);
        lastObserved.set(nodeId, { administrators, observedAt: new Date().toISOString() });
      } catch {
        // Keep the previous answer: a slow device must not fail the whole list.
      }
    }).finally(() => inFlight.delete(nodeId));
    inFlight.set(nodeId, reading);
    return reading;
  }

  async function describe(
    peer: ClientNode,
    nodeId: string,
    attestation: AttestationRecord,
    waitUntil: Promise<void>,
  ): Promise<InventoryNode> {
    const reachable = peer.lifecycle.isOnline;
    if (reachable) await Promise.race([observe(peer, nodeId), waitUntil]);
    const observed = lastObserved.get(nodeId);
    const cached = (peer.state as { operationalCredentials?: { fabrics?: unknown } }).operationalCredentials;
    return describeNode({
      nodeId,
      reachable,
      endpoints: [...peer.endpoints] as unknown as EndpointLike[],
      attestation,
      administrators:
        observed?.administrators ?? administratorsOf(cached?.fabrics, peer.state.commissioning.fabricIndexOnPeer),
      observedAt: observed?.observedAt ?? null,
    });
  }

  /** Resolves after the live-read wait, so one request never waits longer than that for slow devices. */
  function waitBudget(): { until: Promise<void>; done: () => void } {
    let timer: NodeJS.Timeout | undefined;
    const until = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, LIVE_READ_WAIT_MS);
      timer.unref();
    });
    return { until, done: () => clearTimeout(timer) };
  }

  async function list(): Promise<OperationResponse<'inventory.list'>> {
    const status = manager.status();
    if (status.state !== 'initialized') {
      // Without a controller the sidecar knows nothing: only "no fabric" is a complete answer.
      return { authoritative: status.state === 'uninitialized', fabricId: null, nodes: [] };
    }
    const controller = manager.controller;
    if (!controller?.running) return { authoritative: false, fabricId: status.fabricId, nodes: [] };
    const peers = commissionedPeers(controller);
    const ids = peers.map((peer) => nodeIdOf(peer) as string);
    prune(status.fabricId, new Set(ids));
    const attestationOf = readAttestations(manager.layout);
    const budget = waitBudget();
    try {
      const nodes = await Promise.all(
        peers.map((peer, i) => describe(peer, ids[i], attestationOf(ids[i]), budget.until)),
      );
      // A peer without cached basic information has not been interrogated yet, so its entry is incomplete.
      const complete = nodes.every((node) => node.vendorId !== null || node.productId !== null);
      return { authoritative: complete, fabricId: status.fabricId, nodes };
    } finally {
      budget.done();
    }
  }

  return {
    'inventory.list': list,
    'inventory.get': async ({ params }) => {
      const nodeId = (params as { nodeId: string }).nodeId;
      let peer: ClientNode;
      try {
        peer = findPeer(requireController(manager), nodeId);
      } catch (error) {
        if (error instanceof ApiError && error.code === 'not_found') lastObserved.delete(nodeId);
        throw error;
      }
      const budget = waitBudget();
      try {
        return await describe(peer, nodeId, readAttestation(manager.layout, nodeId), budget.until);
      } finally {
        budget.done();
      }
    },
  };
}
