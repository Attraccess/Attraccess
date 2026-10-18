import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomBytes } from 'crypto';

/** Intentionally has no production provider until ATT-950 supplies card cryptography. */
export const SERVER_CARD_VERIFIER = Symbol('SERVER_CARD_VERIFIER');

export interface CardOperationBinding {
  readerId: number;
  credentialGeneration: number;
  connectionGeneration: string;
  installationId: string;
  cardId: string;
  applicationId: string;
  slot: number;
  activationId: string;
  resourceId: number;
  operation: string;
}

export interface ServerVerifiedCardResult extends CardOperationBinding {
  issuedAt: number;
  deadline: number;
}

export interface ServerCardVerifier {
  verify(binding: Readonly<CardOperationBinding>, deadline: number): Promise<ServerVerifiedCardResult | null>;
}

const BINDING_FIELDS: readonly (keyof CardOperationBinding)[] = [
  'readerId',
  'credentialGeneration',
  'connectionGeneration',
  'installationId',
  'cardId',
  'applicationId',
  'slot',
  'activationId',
  'resourceId',
  'operation',
];

function sameBinding(a: CardOperationBinding, b: CardOperationBinding): boolean {
  return BINDING_FIELDS.every((field) => a[field] === b[field]);
}

function validBinding(binding: CardOperationBinding): boolean {
  return (
    binding &&
    [binding.readerId, binding.credentialGeneration, binding.resourceId].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    ) &&
    Number.isSafeInteger(binding.slot) &&
    binding.slot >= 0 &&
    binding.slot <= 255 &&
    [
      binding.connectionGeneration,
      binding.installationId,
      binding.cardId,
      binding.applicationId,
      binding.activationId,
      binding.operation,
    ].every((value) => typeof value === 'string' && value.length > 0)
  );
}

@Injectable()
export class VerifiedCardSessionService {
  private readonly proofs = new Map<string, ServerVerifiedCardResult>();
  private readonly pending = new Set<{ binding: CardOperationBinding; cancelled: boolean }>();

  constructor(@Optional() @Inject(SERVER_CARD_VERIFIER) private readonly verifier?: ServerCardVerifier) {}

  get available(): boolean {
    return this.verifier !== undefined;
  }

  /** Only the injected server verifier can produce a result. Reader JSON cannot mint a proof. */
  async verify(binding: CardOperationBinding, operationDeadline: number): Promise<string | null> {
    if (!this.verifier || !validBinding(binding)) return null;
    const now = Date.now();
    if (!Number.isSafeInteger(operationDeadline) || operationDeadline <= now) return null;
    this.prune(now);
    const snapshot = Object.freeze({ ...binding });
    const pending = { binding: snapshot, cancelled: false };
    this.pending.add(pending);
    try {
      const result = await this.verifier.verify(snapshot, operationDeadline);
      const completedAt = Date.now();
      if (
        pending.cancelled ||
        !result ||
        !sameBinding(snapshot, result) ||
        !Number.isSafeInteger(result.issuedAt) ||
        !Number.isSafeInteger(result.deadline) ||
        result.issuedAt < now ||
        result.issuedAt > completedAt ||
        result.deadline <= completedAt ||
        result.deadline > operationDeadline ||
        result.deadline > result.issuedAt + 30_000
      )
        return null;
      const handle = randomBytes(32).toString('base64url');
      this.proofs.set(handle, { ...result });
      return handle;
    } finally {
      this.pending.delete(pending);
    }
  }

  /** Synchronous take-and-delete makes competing consumption attempts mutually exclusive. */
  consume(handle: string, binding: CardOperationBinding): boolean {
    const proof = this.proofs.get(handle);
    this.proofs.delete(handle);
    return !!proof && validBinding(binding) && Date.now() < proof.deadline && sameBinding(proof, binding);
  }

  cancelConnection(connectionGeneration: string): void {
    this.cancel((binding) => binding.connectionGeneration === connectionGeneration);
  }

  cancelReader(readerId: number): void {
    this.cancel((binding) => binding.readerId === readerId);
  }

  cancelActivation(connectionGeneration: string, activationId: string): void {
    this.cancel(
      (binding) => binding.connectionGeneration === connectionGeneration && binding.activationId === activationId,
    );
  }

  private cancel(matches: (binding: CardOperationBinding) => boolean): void {
    for (const [handle, proof] of this.proofs) if (matches(proof)) this.proofs.delete(handle);
    for (const pending of this.pending) if (matches(pending.binding)) pending.cancelled = true;
  }

  private prune(now: number): void {
    for (const [handle, proof] of this.proofs) if (now >= proof.deadline) this.proofs.delete(handle);
  }
}
