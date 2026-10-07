import type { defineExplicitInstallActionTests } from './CommissioningModal.test.client';
import type { defineExplicitRecoveryActionTests } from './CommissioningModal.test.client';
import type { defineFw31SoftwareSupportBoundaryTests } from './CommissioningModal.test.client';
import type { defineRootTestRegistrationsTests } from './CommissioningModal.test.client';
import type { getSetupScope } from './CommissioningModal.test.client';

export type ExplicitInstallActionTestScope = ReturnType<typeof defineExplicitInstallActionTests>;
export type ExplicitRecoveryActionTestScope = ReturnType<typeof defineExplicitRecoveryActionTests>;
export type Fw31SoftwareSupportBoundaryTestScope = ReturnType<typeof defineFw31SoftwareSupportBoundaryTests>;
export type RootTestRegistrationsTestScope = ReturnType<typeof defineRootTestRegistrationsTests>;
export type SetupScope = ReturnType<typeof getSetupScope>;
