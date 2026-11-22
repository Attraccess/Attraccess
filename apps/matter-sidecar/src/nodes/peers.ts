import { OperationalCredentials } from '@matter/main/clusters';
import type { ClientNode } from '@matter/main';
import { Read } from '@matter/main/protocol';
import { ApiError } from '../api-error';
import type { MatterController } from '../fabric/controller';
import type { FabricManager } from '../fabric/manager';
import { administratorsOf, type Administrator } from '../inventory/describe';

/** The running controller, or the precise reason there is none. */
export function requireController(manager: FabricManager): MatterController {
  const status = manager.status();
  if (status.state === 'recovery_required') {
    throw new ApiError('recovery_required', 'The Matter storage needs recovery.', { reason: status.reason });
  }
  const controller = manager.controller;
  if (status.state === 'uninitialized' || !controller?.running) {
    throw new ApiError('fabric_absent', 'There is no fabric.');
  }
  return controller;
}

export const nodeIdOf = (peer: ClientNode): string | undefined => {
  const nodeId = peer.state.commissioning.peerAddress?.nodeId;
  return nodeId === undefined ? undefined : String(nodeId);
};

/** The commissioned peers of the controller. */
export function commissionedPeers(controller: MatterController): ClientNode[] {
  return [...controller.serverNode.peers].filter(
    (peer) => peer.lifecycle.isCommissioned && nodeIdOf(peer) !== undefined,
  );
}

export function findPeer(controller: MatterController, nodeId: string): ClientNode {
  const peer = commissionedPeers(controller).find((candidate) => nodeIdOf(candidate) === nodeId);
  if (!peer) throw new ApiError('not_found', 'There is no such node in the fabric.');
  return peer;
}

class StepTimeout extends Error {}

/**
 * Runs `work` inside the fabric gate. The request is answered when `work` settles, or earlier when it calls
 * `replyEarly` with an error. The gate stays held until `work` settles either way, so a device step that outlived its
 * reply (it cannot be cancelled) is never overlapped by the next fabric operation.
 */
export function runExclusiveWithEarlyReply<T>(
  manager: FabricManager,
  work: (replyEarly: (error: unknown) => void) => Promise<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // After the early reply, the late resolve or reject is a no-op: the caller has its answer.
    manager.runExclusive(() => work(reject)).then(resolve, reject);
  });
}

/** How long a removal or share keeps the gate after its reply, waiting for a step it could not cancel to settle. */
export const LATE_SETTLE_MS = 30_000;

/**
 * Waits up to `ms` for `work` to settle. `fulfilled` carries its value; `pending` means it is still running (its
 * outcome is unknown); `rejected` means it failed.
 */
export async function settleWithin<T>(
  work: Promise<T>,
  ms: number,
): Promise<{ state: 'fulfilled'; value: T } | { state: 'rejected' | 'pending' }> {
  let timer: NodeJS.Timeout | undefined;
  const pending = new Promise<{ state: 'pending' }>((resolve) => {
    timer = setTimeout(() => resolve({ state: 'pending' }), ms);
    timer.unref();
  });
  try {
    return await Promise.race([
      work.then(
        (value) => ({ state: 'fulfilled' as const, value }),
        () => ({ state: 'rejected' as const }),
      ),
      pending,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export const isStepTimeout = (error: unknown) => error instanceof StepTimeout;

/**
 * Rejects with a `StepTimeout` after `ms`, or when `signal` aborts (at once if it already has). The work is not
 * cancelled: a caller that started a change on the device must still wait for `work` to learn its outcome.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // The work may fail after the race is over; nobody is listening then.
    work.catch(() => undefined);
    if (signal?.aborted) return reject(new StepTimeout());
    const timer = setTimeout(() => reject(new StepTimeout()), ms);
    const onAbort = () => reject(new StepTimeout());
    signal?.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    });
  });
}

/**
 * Reads every fabric the device lists. The cache matter.js keeps is fabric-filtered (it shows only our own fabric), so
 * this asks the device without the filter. Fails when the device cannot be reached within `timeoutMs`.
 */
export async function readAdministrators(
  peer: ClientNode,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Administrator[]> {
  const read = async () => {
    let fabrics: unknown;
    for await (const chunk of peer.interaction.read(
      Read(
        { fabricFilter: false },
        Read.Attribute({ endpoint: peer, cluster: OperationalCredentials.Cluster, attributes: 'fabrics' }),
      ),
    )) {
      for await (const report of chunk) if (report.kind === 'attr-value') fabrics = report.value;
    }
    if (!Array.isArray(fabrics)) throw new Error('The device did not report its fabrics.');
    return administratorsOf(fabrics, peer.state.commissioning.fabricIndexOnPeer);
  };
  return withTimeout(read(), timeoutMs, signal);
}
