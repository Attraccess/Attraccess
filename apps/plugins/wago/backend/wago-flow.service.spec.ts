import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoController } from './wago-controller.entity';
import { WagoFlowService } from './wago-flow.service';
import { WagoSettings } from './wago-settings.entity';
import { registerIsolatesFilteredPreviewControllerLookupsInASharedContext } from './wago-flow.service.drops-queued-events-from-a-retired-boot-while-keeping-the-dispatch-queue-bounded.test-cases';
import { registerStartsWithAnUnavailableMqttBrokerAndRetriesFlowSubscriptions } from './wago-flow.service.shares-applied-configuration-lookups-while-validating-a-flow.test-cases';
import { registerStillFailsStartupWhenFlowSettingsCannotBeRead } from './wago-flow.service.shares-applied-configuration-lookups-while-validating-a-flow.test-cases';
import { registerRejectsAnInvalidOperationalPrefixBeforeAttemptingMqttSubscriptions } from './wago-flow.service.preserves-source-metadata-and-independent-category-counters-across-interleaving-and-boot-restart.test-cases';
import { registerRegistersThePluginBeforeTheHostDatasourceIsAvailable } from './wago-flow.service.preserves-source-metadata-and-independent-category-counters-across-interleaving-and-boot-restart.test-cases';
import { registerValidatesAppliedChannelsForSNodes } from './wago-flow.service.shares-applied-configuration-lookups-while-validating-a-flow.test-cases';
import { registerProvidesAConciseSPreviewForTheSelectedOutput } from './wago-flow.service.preserves-source-metadata-and-independent-category-counters-across-interleaving-and-boot-restart.test-cases';
import { registerIdentifiesAnExternalMeterAndKeepsAZeroValuedWaitConditionVisible } from './wago-flow.service.drops-queued-events-from-a-retired-boot-while-keeping-the-dispatch-queue-bounded.test-cases';
import { registerUsesCurrentAppliedChannelNamesInTheFormEvenWhenTheRuntimeCacheIsPopulated } from './wago-flow.service.shares-applied-configuration-lookups-while-validating-a-flow.test-cases';
import { registerRejectsInvalidWaitConditionsAndEventFilters } from './wago-flow.service.preserves-source-metadata-and-independent-category-counters-across-interleaving-and-boot-restart.test-cases';
import { registerSharesAppliedConfigurationLookupsWhileValidatingAFlow } from './wago-flow.service.shares-applied-configuration-lookups-while-validating-a-flow.test-cases';
import { registerSerializesConcurrentControllerMessagesBeforeAsynchronousChannelResolution } from './wago-flow.service.preserves-source-metadata-and-independent-category-counters-across-interleaving-and-boot-restart.test-cases';
import { registerCachesAValidatedRetainedStateAndDispatchesMatchingTriggerNodes } from './wago-flow.service.ages-a-previously-fresh-value-using-source-time-without-erasing-readable-state.test-cases';
import { registerIgnoresDuplicateSequencesAndResolvesWaitersFromLaterState } from './wago-flow.service.drops-queued-events-from-a-retired-boot-while-keeping-the-dispatch-queue-bounded.test-cases';
import { registerOnlyEvaluatesWaitersForTheUpdatedChannelState } from './wago-flow.service.keeps-a-pending-wait-through-stale-and-replayed-matches-until-fresh-reconnect-state.test-cases';
import { registerCancelsPendingStateWaitsDuringShutdown } from './wago-flow.service.ages-a-previously-fresh-value-using-source-time-without-erasing-readable-state.test-cases';
import { registerLoadsOnlyTheLatestAppliedRevisionPerControllerAndPrunesRemovedChannelState } from './wago-flow.service.keeps-a-pending-wait-through-stale-and-replayed-matches-until-fresh-reconnect-state.test-cases';
import { registerIsolatesMessagesFromAnotherMqttServerAndAcceptsANewerControllerRestart } from './wago-flow.service.drops-queued-events-from-a-retired-boot-while-keeping-the-dispatch-queue-bounded.test-cases';
import { registerUsesSourceTimestampsForStaleStateAndReturnsNodeSpecificSchemas } from './wago-flow.service.shares-applied-configuration-lookups-while-validating-a-flow.test-cases';
import { registerOffersStateForInputOnlyChannelsInTheSEditor } from './wago-flow.service.keeps-a-pending-wait-through-stale-and-replayed-matches-until-fresh-reconnect-state.test-cases';
import { registerResetsMinimumChangeComparisonsWhenUnitsKindsOrBootStreamsChange } from './wago-flow.service.preserves-source-metadata-and-independent-category-counters-across-interleaving-and-boot-restart.test-cases';
import { registerAppliesMinimumIntervalsFromTheLastDispatchForEachTriggerNode } from './wago-flow.service.ages-a-previously-fresh-value-using-source-time-without-erasing-readable-state.test-cases';

import { STREAM_A } from './wago-flow.state';
import { STREAM_B } from './wago-flow.state';
import { defineCanonicalParserConsumerContractTests } from './canonical-parser-consumer.test-cases';
import { defineWaitFreshnessTests } from './wait-freshness.test-cases';

describe('WagoFlowService', () => {
  defineWagoFlowServiceTests();
});

export function defineWagoFlowServiceTests() {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-05T12:00:00.000Z'));
  });
  afterEach(() => jest.useRealTimers());
  const controller = { id: 1, hardwareId: 'cc100-01', trustState: 'claimed', mqttServerId: null } as WagoController;
  const revision = {
    controllerId: 1,
    revision: 1,
    contentHash: 'hash',
    state: 'applied',
    snapshot: JSON.stringify({ logicalChannels: [{ id: 'door', capabilities: ['output'] }] }),
  } as WagoConfigurationRevision;

  function createService() {
    const trigger = jest.fn().mockResolvedValue(undefined);
    const controllerRepository = { find: jest.fn().mockResolvedValue([controller]), findOneBy: jest.fn() };
    const revisionQuery = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([revision]),
    };
    const revisionRepository = {
      find: jest.fn().mockResolvedValue([revision]),
      createQueryBuilder: jest.fn().mockReturnValue(revisionQuery),
    };
    const settingsRepository = {
      findOneBy: jest
        .fn()
        .mockResolvedValue({ id: 1, defaultMqttServerId: 2, operationalPrefix: 'attraccess/wago' } as WagoSettings),
    };
    const context = {
      getRepository: jest.fn((entity) =>
        entity === WagoController
          ? controllerRepository
          : entity === WagoConfigurationRevision
            ? revisionRepository
            : settingsRepository,
      ),
      logger: { warn: jest.fn() },
      flows: { trigger },
      mqtt: { subscribe: jest.fn().mockResolvedValue({ unsubscribe: jest.fn() }) },
    } as unknown as PluginContext;
    return {
      service: new WagoFlowService(context),
      trigger,
      context,
      revisionQuery,
      revisionRepository,
      controllerRepository,
    };
  }
  const scope = {
    get createService() {
      return createService;
    },
    get controller() {
      return controller;
    },
    get revision() {
      return revision;
    },
    get STREAM_A() {
      return STREAM_A;
    },
    get STREAM_B() {
      return STREAM_B;
    },
  };

  registerIsolatesFilteredPreviewControllerLookupsInASharedContext(scope);

  registerStartsWithAnUnavailableMqttBrokerAndRetriesFlowSubscriptions(scope);

  registerStillFailsStartupWhenFlowSettingsCannotBeRead(scope);

  registerRejectsAnInvalidOperationalPrefixBeforeAttemptingMqttSubscriptions(scope);

  registerRegistersThePluginBeforeTheHostDatasourceIsAvailable(scope);

  registerValidatesAppliedChannelsForSNodes(scope);

  registerProvidesAConciseSPreviewForTheSelectedOutput(scope);

  registerIdentifiesAnExternalMeterAndKeepsAZeroValuedWaitConditionVisible(scope);

  registerUsesCurrentAppliedChannelNamesInTheFormEvenWhenTheRuntimeCacheIsPopulated(scope);

  registerRejectsInvalidWaitConditionsAndEventFilters(scope);

  registerSharesAppliedConfigurationLookupsWhileValidatingAFlow(scope);

  registerSerializesConcurrentControllerMessagesBeforeAsynchronousChannelResolution(scope);

  registerCachesAValidatedRetainedStateAndDispatchesMatchingTriggerNodes(scope);

  registerIgnoresDuplicateSequencesAndResolvesWaitersFromLaterState(scope);

  registerOnlyEvaluatesWaitersForTheUpdatedChannelState(scope);

  registerCancelsPendingStateWaitsDuringShutdown(scope);

  registerLoadsOnlyTheLatestAppliedRevisionPerControllerAndPrunesRemovedChannelState(scope);

  registerIsolatesMessagesFromAnotherMqttServerAndAcceptsANewerControllerRestart(scope);

  registerUsesSourceTimestampsForStaleStateAndReturnsNodeSpecificSchemas(scope);

  registerOffersStateForInputOnlyChannelsInTheSEditor(scope);

  describe('wait freshness', () => {
    defineWaitFreshnessTests(scope);
  });

  describe('canonical parser/consumer contract', () => {
    defineCanonicalParserConsumerContractTests(scope);
  });

  registerResetsMinimumChangeComparisonsWhenUnitsKindsOrBootStreamsChange(scope);

  registerAppliesMinimumIntervalsFromTheLastDispatchForEachTriggerNode(scope);

  return scope;
}

export type WagoFlowServiceTestScope = ReturnType<typeof defineWagoFlowServiceTests>;
export type CanonicalParserConsumerContractTestScope = ReturnType<typeof defineCanonicalParserConsumerContractTests>;
export type WaitFreshnessTestScope = ReturnType<typeof defineWaitFreshnessTests>;

export { defineCanonicalParserConsumerContractTests } from './canonical-parser-consumer.test-cases';
export { defineWaitFreshnessTests } from './wait-freshness.test-cases';
