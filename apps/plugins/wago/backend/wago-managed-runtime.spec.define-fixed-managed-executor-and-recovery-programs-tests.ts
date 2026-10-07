import { registerFixedManagedExecutorAndRecoveryProgramsReportsTheLegacyReceiverCapabilityWithoutTakingTheMutationLock } from './wago-managed-runtime.fixed-managed-executor-and-recovery-programs-reports-the-legacy-receiver-capability-without-taking-the-mutation-lock.test-cases';
import { registerFixedManagedExecutorAndRecoveryProgramsReportsUpdateStorageRequirementsWithoutWritingControllerStateSStat } from './wago-managed-runtime.fixed-managed-executor-and-recovery-programs-reports-update-storage-requirements-without-writing-controller-state-s-stat.test-cases';
import { registerFixedManagedExecutorAndRecoveryProgramsInspectsTheRunningImageWithoutInterruptingABusyHardwareSupervisorSStat } from './wago-managed-runtime.fixed-managed-executor-and-recovery-programs-inspects-the-running-image-without-interrupting-a-busy-hardware-supervisor-s-stat.test-cases';
import { registerFixedManagedExecutorAndRecoveryProgramsUsesTheSameRtuContractInStageActivationAcceptanceAndRecoveryAndPreservesFixedDiagnosti } from './wago-managed-runtime.fixed-managed-executor-and-recovery-programs-uses-the-same-rtu-contract-in-stage-activation-acceptance-and-recovery-and-preserves-fixed-diagnosti.test-cases';
import { registerFixedManagedExecutorAndRecoveryProgramsProvisionsOnActualFw31ToolsWithoutChpasswdGetentOrVisudoAndRestoresInterruptedCutoverR } from './wago-managed-runtime.fixed-managed-executor-and-recovery-programs-provisions-on-actual-fw31-tools-without-chpasswd-getent-or-visudo-and-restores-interrupted-cutover-r.test-cases';
import { registerFixedManagedExecutorAndRecoveryProgramsAcceptsRealCommissioningJournalsInDependencyOrderAndFencesForeignTokensBeforeCleanupS } from './wago-managed-runtime.fixed-managed-executor-and-recovery-programs-accepts-real-commissioning-journals-in-dependency-order-and-fences-foreign-tokens-before-cleanup-s.test-cases';
import { registerFixedManagedExecutorAndRecoveryProgramsExecutesAFullRepeatedImageUpdateThroughOnlyTheFixedDispatcherPreservingEnrolledStateS } from './wago-managed-runtime.fixed-managed-executor-and-recovery-programs-executes-a-full-repeated-image-update-through-only-the-fixed-dispatcher-preserving-enrolled-state-s-.test-cases';
import { registerFixedManagedExecutorAndRecoveryProgramsGeneratesValidPosixShellWithDynamicBoundedArtifactParametersNoSuppliedScriptsEval } from './wago-managed-runtime.fixed-managed-executor-and-recovery-programs-generates-valid-posix-shell-with-dynamic-bounded-artifact-parameters-no-supplied-scripts-eval.test-cases';
import { registerFixedManagedExecutorAndRecoveryProgramsMigratesCredentialUpdateOperationStorageTogetherAndRefusesDestructiveDowngradeWithCredent } from './wago-managed-runtime.fixed-managed-executor-and-recovery-programs-migrates-credential-update-operation-storage-together-and-refuses-destructive-downgrade-with-credent.test-cases';
import { artifact } from './wago-managed-runtime.spec.artifact';

export function defineFixedManagedExecutorAndRecoveryProgramsTests() {
  const scope = {
    get artifact() {
      return artifact;
    },
  };
  registerFixedManagedExecutorAndRecoveryProgramsReportsTheLegacyReceiverCapabilityWithoutTakingTheMutationLock(scope);
  registerFixedManagedExecutorAndRecoveryProgramsReportsUpdateStorageRequirementsWithoutWritingControllerStateSStat(
    scope,
  );
  registerFixedManagedExecutorAndRecoveryProgramsInspectsTheRunningImageWithoutInterruptingABusyHardwareSupervisorSStat(
    scope,
  );
  registerFixedManagedExecutorAndRecoveryProgramsUsesTheSameRtuContractInStageActivationAcceptanceAndRecoveryAndPreservesFixedDiagnosti(
    scope,
  );
  registerFixedManagedExecutorAndRecoveryProgramsProvisionsOnActualFw31ToolsWithoutChpasswdGetentOrVisudoAndRestoresInterruptedCutoverR(
    scope,
  );
  registerFixedManagedExecutorAndRecoveryProgramsAcceptsRealCommissioningJournalsInDependencyOrderAndFencesForeignTokensBeforeCleanupS(
    scope,
  );
  registerFixedManagedExecutorAndRecoveryProgramsExecutesAFullRepeatedImageUpdateThroughOnlyTheFixedDispatcherPreservingEnrolledStateS(
    scope,
  );
  registerFixedManagedExecutorAndRecoveryProgramsGeneratesValidPosixShellWithDynamicBoundedArtifactParametersNoSuppliedScriptsEval(
    scope,
  );

  registerFixedManagedExecutorAndRecoveryProgramsMigratesCredentialUpdateOperationStorageTogetherAndRefusesDestructiveDowngradeWithCredent(
    scope,
  );

  return scope;
}
