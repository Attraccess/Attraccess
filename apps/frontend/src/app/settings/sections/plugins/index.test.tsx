import './index.test.hoisted';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, vi } from 'vitest';
import { resetTestFixture } from './index.test.reset-fixture';

import { definePluginsSectionTests } from './index.test.define-plugins-section-tests';
import type { PluginsSectionTestScope } from './index.test.contracts';
import { definePluginDependencyConfirmationsTests } from './index.test.deferred.helpers';
import type { PluginDependencyConfirmationsTestScope } from './index.test.contracts';
import { defineRootTestRegistrationsTests } from './index.test.deferred.helpers';
import type { RootTestRegistrationsTestScope } from './index.test.contracts';
import { getSetupScope } from './index.test.deferred.helpers';
import type { SetupScope } from './index.test.contracts';
beforeEach(() => {
  resetTestFixture(getSetupScope());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('PluginsSection', () => {
  definePluginsSectionTests();
});
describe('plugin dependency confirmations', () => {
  definePluginDependencyConfirmationsTests();
});
defineRootTestRegistrationsTests();
export { definePluginsSectionTests } from './index.test.define-plugins-section-tests';
export { type PluginsSectionTestScope };
export { definePluginDependencyConfirmationsTests } from './index.test.deferred.helpers';
export { type PluginDependencyConfirmationsTestScope };
export { defineRootTestRegistrationsTests } from './index.test.deferred.helpers';
export { type RootTestRegistrationsTestScope };
export { getSetupScope } from './index.test.deferred.helpers';
export { type SetupScope };
