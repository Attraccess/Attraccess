import { BillingTransaction, BillingTransactionItem } from '@attraccess/database-entities';
import {
  BillingTransactionStatus,
  MeteringCorrectionDraft,
  MeteringCorrectionRecord,
} from '@attraccess/application-models';
import { EntityManager, In } from 'typeorm';

/**
 * A pending share that will never be charged (the session failed or was waived) no longer says it is charged
 * later: its line reads like any meter line without a final reading. Only display data of the item changes.
 */
export async function clearPendingShareMarkers(manager: EntityManager, sessionIds: string[]): Promise<void> {
  if (!sessionIds.length) return;
  await manager.update(
    BillingTransactionItem,
    { externalReference: In(sessionIds.map((id) => `metering:${id}:unavailable`)) },
    { allocation: null },
  );
}

/** A new, completed correction of an already completed bill. */
export async function insertCorrection(
  manager: EntityManager,
  draft: MeteringCorrectionDraft,
): Promise<MeteringCorrectionRecord> {
  const saved = await manager.save(BillingTransaction, {
    userId: draft.userId,
    initiatorId: draft.initiatorId,
    correctionOfId: draft.correctionOfId,
    amount: draft.amount,
    status: BillingTransactionStatus.Completed,
  });
  return { id: saved.id, userId: saved.userId, amount: saved.amount, status: saved.status };
}
