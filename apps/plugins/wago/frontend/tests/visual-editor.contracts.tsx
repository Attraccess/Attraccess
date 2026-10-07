import '@testing-library/jest-dom/vitest';
import { defineConfigurationWorkspaceTests } from './visual-editor.test.client';
import { defineModbusOutputAndSerialCompositionTests } from './visual-editor.setup.test-fixture.helpers';
import { defineModbusReviewRegressionsTests } from './visual-editor.test.client';
import { defineMountedModbusConfigurationTests } from './visual-editor.test.client';
import { defineRootTestRegistrationsTests } from './visual-editor.setup.test-fixture.helpers';
import { getSetupScope } from './visual-editor.test.client';
import { defineVisualConfigurationWorkflowTests } from './visual-editor.test.client';

export type ConfigurationWorkspaceTestScope = ReturnType<typeof defineConfigurationWorkspaceTests>;

export type ModbusOutputAndSerialCompositionTestScope = ReturnType<typeof defineModbusOutputAndSerialCompositionTests>;

export type ModbusReviewRegressionsTestScope = ReturnType<typeof defineModbusReviewRegressionsTests>;

export type MountedModbusConfigurationTestScope = ReturnType<typeof defineMountedModbusConfigurationTests>;

export type RootTestRegistrationsTestScope = ReturnType<typeof defineRootTestRegistrationsTests>;

export type SetupScope = ReturnType<typeof getSetupScope>;

export type VisualConfigurationWorkflowTestScope = ReturnType<typeof defineVisualConfigurationWorkflowTests>;
