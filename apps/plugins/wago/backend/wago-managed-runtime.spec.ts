import { WagoService } from './wago.service';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import { managedSsh } from './wago-managed-ssh';
import { commissioningVerification } from './wago-commissioning-verification';
import { defineManagedEnrolmentAndDurableCredentialLifecycleTests } from './wago-managed-runtime.spec.define-managed-enrolment-and-durable-credential-lifecycle-tests';
import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec.managed-enrolment-and-durable-credential-lifecycle-test-scope';
import { defineFixedManagedExecutorAndRecoveryProgramsTests } from './wago-managed-runtime.spec.define-fixed-managed-executor-and-recovery-programs-tests';
import { FixedManagedExecutorAndRecoveryProgramsTestScope } from './wago-managed-runtime.spec.fixed-managed-executor-and-recovery-programs-test-scope';

jest.mock('@attraccess/plugins-backend-sdk', () => jest.requireActual('typeorm'));
jest.mock('./wago.service', () => ({ WagoService: class {} }));
jest.mock('./wago-runtime-artifacts', () => ({ WagoRuntimeArtifactsService: class {} }));
jest.mock('./wago-commissioning-readiness', () => ({ WagoCommissioningReadiness: class {} }));
jest.mock('./wago-managed-ssh', () => ({ ...jest.requireActual('./wago-managed-ssh'), managedSsh: jest.fn() }));
jest.mock('./wago-commissioning-verification', () => ({ commissioningVerification: jest.fn() }));
describe('managed enrolment and durable credential lifecycle', () => {
  defineManagedEnrolmentAndDurableCredentialLifecycleTests();
});

describe('fixed managed executor and recovery programs', () => {
  defineFixedManagedExecutorAndRecoveryProgramsTests();
});
export { defineManagedEnrolmentAndDurableCredentialLifecycleTests } from './wago-managed-runtime.spec.define-managed-enrolment-and-durable-credential-lifecycle-tests';
export { type ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec.managed-enrolment-and-durable-credential-lifecycle-test-scope';
export { defineFixedManagedExecutorAndRecoveryProgramsTests } from './wago-managed-runtime.spec.define-fixed-managed-executor-and-recovery-programs-tests';
export { type FixedManagedExecutorAndRecoveryProgramsTestScope } from './wago-managed-runtime.spec.fixed-managed-executor-and-recovery-programs-test-scope';
