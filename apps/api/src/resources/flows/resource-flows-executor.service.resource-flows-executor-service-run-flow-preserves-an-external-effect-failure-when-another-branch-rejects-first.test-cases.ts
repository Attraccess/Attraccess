import { NodeProcessingResult } from './node-executors';
import { ExternalEffectFailureError } from './errors/external-effect-failure.error';
import { settleFlowBranches } from './flow-execution-engine';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowPreservesAnExternalEffectFailureWhenAnotherBranchRejectsFirst(
  _scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('preserves an external-effect failure when another branch rejects first', async () => {
    const externalFailure = new ExternalEffectFailureError('controller rejected', new Error('offline'));
    let rejectExternal!: (error: Error) => void;
    const laterExternalFailure = new Promise<never>((_resolve, reject) => {
      rejectExternal = reject;
    });
    const ordinaryFailure = Promise.reject(new Error('ordinary node failure'));

    const settled = settleFlowBranches([
      ordinaryFailure as Promise<NodeProcessingResult[]>,
      laterExternalFailure as Promise<NodeProcessingResult[]>,
    ]);
    await Promise.resolve();
    rejectExternal(externalFailure);

    await expect(settled).rejects.toBe(externalFailure);
  });
}
