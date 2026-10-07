import { NodeProcessingResult } from './node-executors';
import { ExternalEffectFailureError } from './errors/external-effect-failure.error';
export async function settleFlowBranches(branches: Promise<NodeProcessingResult[]>[]): Promise<NodeProcessingResult[]> {
  // A failed branch cannot release a lifecycle reservation while sibling effects are still running.
  // Wait for work already started, then preserve lifecycle-fatal failures over ordinary node errors.
  let failure: { error: unknown } | undefined;
  const results = await Promise.allSettled(
    branches.map((branch) =>
      branch.catch((error) => {
        if (
          !failure ||
          (error instanceof ExternalEffectFailureError && !(failure.error instanceof ExternalEffectFailureError))
        ) {
          failure = { error };
        }
        throw error;
      }),
    ),
  );
  if (failure) throw failure.error;
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}
