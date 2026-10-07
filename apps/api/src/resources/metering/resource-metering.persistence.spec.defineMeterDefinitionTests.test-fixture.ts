import { registerMeterDefinitionIsConfiguredOnlyWhenEachTriggerReachesItsCompletionNode } from './resource-metering.persistence.meter-definition-is-configured-only-when-each-trigger-reaches-its-completion-node.test-cases';
import { registerMeterDefinitionAppliesTheDocumentedDefaultsToTriggerSettings } from './resource-metering.persistence.meter-definition-applies-the-documented-defaults-to-trigger-settings.test-cases';
import { inheritTestScope } from '../../test-utils/inherit-test-scope';
import { FlowDefinedMeteringTestScope } from './resource-metering.persistence.spec';

export function defineMeterDefinitionTests(parentScope: FlowDefinedMeteringTestScope) {
  const scope = inheritTestScope(
    {
      get metering() {
        return parentScope.metering;
      },
      set metering(value: typeof parentScope.metering) {
        parentScope.metering = value;
      },
      get seedMeter() {
        return parentScope.seedMeter;
      },
      get source() {
        return parentScope.source;
      },
      set source(value: typeof parentScope.source) {
        parentScope.source = value;
      },
    },
    parentScope,
  );
  registerMeterDefinitionIsConfiguredOnlyWhenEachTriggerReachesItsCompletionNode(scope);

  registerMeterDefinitionAppliesTheDocumentedDefaultsToTriggerSettings(scope);

  return scope;
}
