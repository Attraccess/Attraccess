import './visual-editor.test.state';
import { afterAll, afterEach, beforeAll, beforeEach, describe, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { resetTestFixture } from './visual-editor.setup.test-fixture.helpers';

import {
  client,
  defineVisualConfigurationWorkflowTests,
  defineModbusReviewRegressionsTests,
  defineConfigurationWorkspaceTests,
  defineMountedModbusConfigurationTests,
  getSetupScope,
} from './visual-editor.test.client';
import { originalScrollTo } from './visual-editor.test.original-scroll-to';
import { VisualConfigurationWorkflowTestScope } from './visual-editor.contracts';
import { ModbusReviewRegressionsTestScope } from './visual-editor.contracts';
import { ConfigurationWorkspaceTestScope } from './visual-editor.contracts';
import { MountedModbusConfigurationTestScope } from './visual-editor.contracts';
import { defineModbusOutputAndSerialCompositionTests } from './visual-editor.setup.test-fixture.helpers';
import { ModbusOutputAndSerialCompositionTestScope } from './visual-editor.contracts';
import { defineRootTestRegistrationsTests } from './visual-editor.setup.test-fixture.helpers';
import { RootTestRegistrationsTestScope } from './visual-editor.contracts';
import { SetupScope } from './visual-editor.contracts';
beforeAll(() => {
  // JSDOM has no layout scrolling; React Aria calls this when opening a collection.
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterAll(() => {
  if (originalScrollTo) Object.defineProperty(Element.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(Element.prototype, 'scrollTo');
});
beforeEach(() => {
  resetTestFixture(getSetupScope());
});
afterEach(() => {
  cleanup();
  useTranslationState.setState({ language: 'en' });
  client.clear();
  vi.unstubAllGlobals();
});
describe('visual configuration workflow', () => {
  defineVisualConfigurationWorkflowTests();
});

describe('mounted Modbus configuration', () => {
  defineMountedModbusConfigurationTests();
});

describe('Modbus output and serial composition', () => {
  defineModbusOutputAndSerialCompositionTests();
});

describe('Modbus review regressions', () => {
  defineModbusReviewRegressionsTests();
});

describe('configuration workspace', () => {
  defineConfigurationWorkspaceTests();
});
defineRootTestRegistrationsTests();
export {
  defineVisualConfigurationWorkflowTests,
  defineModbusReviewRegressionsTests,
  defineConfigurationWorkspaceTests,
  defineMountedModbusConfigurationTests,
  getSetupScope,
} from './visual-editor.test.client';
export { type VisualConfigurationWorkflowTestScope };
export { type ModbusReviewRegressionsTestScope };
export { type ConfigurationWorkspaceTestScope };
export { type MountedModbusConfigurationTestScope };
export { defineModbusOutputAndSerialCompositionTests } from './visual-editor.setup.test-fixture.helpers';
export { type ModbusOutputAndSerialCompositionTestScope };
export { defineRootTestRegistrationsTests } from './visual-editor.setup.test-fixture.helpers';
export { type RootTestRegistrationsTestScope };
export { type SetupScope };
