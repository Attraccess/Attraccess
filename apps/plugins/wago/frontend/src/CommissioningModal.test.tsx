import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { resetTestFixture } from './CommissioningModal.test.fixtures';
import {
  client,
  defineExplicitRecoveryActionTests,
  defineFw31SoftwareSupportBoundaryTests,
  defineExplicitInstallActionTests,
  defineRootTestRegistrationsTests,
  getSetupScope,
} from './CommissioningModal.test.client';
import { ExplicitRecoveryActionTestScope } from './CommissioningModal.test.contracts';
import { Fw31SoftwareSupportBoundaryTestScope } from './CommissioningModal.test.contracts';
import { ExplicitInstallActionTestScope } from './CommissioningModal.test.contracts';
import { RootTestRegistrationsTestScope } from './CommissioningModal.test.contracts';
import { SetupScope } from './CommissioningModal.test.contracts';

vi.mock('./drawer', () => ({
  StandardDrawer: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
vi.mock('./ControllersTable', () => ({
  commissioningLabel: (state: string) => state,
  RuntimeUpdateDetails: () => <div>Managed recovery controls</div>,
}));
beforeEach(() => {
  resetTestFixture(getSetupScope());
});

afterEach(() => {
  cleanup();
  useTranslationState.setState({ language: 'en' });
  client.clear();
  vi.unstubAllGlobals();
});
describe('FW31 software support boundary', () => {
  defineFw31SoftwareSupportBoundaryTests();
});

describe('explicit recovery action', () => {
  defineExplicitRecoveryActionTests();
});

describe('explicit install action', () => {
  defineExplicitInstallActionTests();
});
defineRootTestRegistrationsTests();
export {
  defineExplicitRecoveryActionTests,
  defineFw31SoftwareSupportBoundaryTests,
  defineExplicitInstallActionTests,
  defineRootTestRegistrationsTests,
  getSetupScope,
} from './CommissioningModal.test.client';
export { type ExplicitRecoveryActionTestScope };
export { type Fw31SoftwareSupportBoundaryTestScope };
export { type ExplicitInstallActionTestScope };
export { type RootTestRegistrationsTestScope };
export { type SetupScope };
