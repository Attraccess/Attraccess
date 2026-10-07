import type { definePluginDependencyConfirmationsTests } from './index.test.deferred.helpers';
import type { definePluginsSectionTests } from './index.test.define-plugins-section-tests';
import type { defineRootTestRegistrationsTests } from './index.test.deferred.helpers';
import type { getSetupScope } from './index.test.deferred.helpers';

export type PluginDependencyConfirmationsTestScope = ReturnType<typeof definePluginDependencyConfirmationsTests>;
export type PluginsSectionTestScope = ReturnType<typeof definePluginsSectionTests>;
export type RootTestRegistrationsTestScope = ReturnType<typeof defineRootTestRegistrationsTests>;
export type SetupScope = ReturnType<typeof getSetupScope>;
