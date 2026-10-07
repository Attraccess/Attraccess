import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
// Integration test: verify the independent plugin catalogs against the same host language store.
import { registerExplainsCleanupLockContentionInTheSelectedLanguageIncludingPartialCleanup } from './i18n.all-official-plugins-follow-the-core-language-before-mounting-and-switch-without-remounting.test-cases';
import { registerAllOfficialPluginsFollowTheCoreLanguageBeforeMountingAndSwitchWithoutRemounting } from './i18n.all-official-plugins-follow-the-core-language-before-mounting-and-switch-without-remounting.test-cases';
import { registerTranslatesRetainedBackendMessagesStatusesAndBuiltinNamesWhilePreservingCustomNamesAndDi } from './i18n.translates-every-diagnostic-freshness-acknowledgement-and-commissioning-readiness-status.test-cases';
import { registerLocalizesModbusAddButtonsWithoutSavingTranslatedSignalNames } from './i18n.all-official-plugins-follow-the-core-language-before-mounting-and-switch-without-remounting.test-cases';
import { registerLocalizesPresetMetadataObjectsAndLeavesWhilePreservingUnknownPresetIdsAndNames } from './i18n.all-official-plugins-follow-the-core-language-before-mounting-and-switch-without-remounting.test-cases';
import { registerPreservesLiteralValidationTextAndResolvesOnlyExactReferencesInRecognizedMessages } from './i18n.preserves-literal-configuration-identifiers-and-unknown-values-in-both-languages.test-cases';
import { registerTranslatesEveryDiagnosticFreshnessAcknowledgementAndCommissioningReadinessStatus } from './i18n.translates-every-diagnostic-freshness-acknowledgement-and-commissioning-readiness-status.test-cases';
import { registerLocalizesBuiltInModbusReviewNamesWhilePreservingCustomNamesAndMetadataOverrides } from './i18n.localizes-built-in-modbus-review-names-while-preserving-custom-names-and-metadata-overrides.test-cases';
import { registerTranslatesTheBackendOwnedReasonsThatDiagnosticSamplesAreNotCurrent } from './i18n.translates-every-diagnostic-freshness-acknowledgement-and-commissioning-readiness-status.test-cases';
import { registerResolvesModbusProfileReferencesByTheSelectedDeviceVersion } from './i18n.preserves-literal-configuration-identifiers-and-unknown-values-in-both-languages.test-cases';
import { registerUpdatesVisibleLabelsWhilePreservingAChannelCreationFormAndItsUserEnteredName } from './i18n.translates-every-diagnostic-freshness-acknowledgement-and-commissioning-readiness-status.test-cases';
import { registerSwitchesChannelPresetLabelsAndPreservesUnknownIdentifiersSS } from './i18n.preserves-literal-configuration-identifiers-and-unknown-values-in-both-languages.test-cases';
import { registerTranslatesConfigurationChoicesByFieldWithoutTranslatingUserNamesOrIdentifiers } from './i18n.preserves-literal-configuration-identifiers-and-unknown-values-in-both-languages.test-cases';
import { registerPreservesLiteralConfigurationIdentifiersAndUnknownValuesInBothLanguages } from './i18n.preserves-literal-configuration-identifiers-and-unknown-values-in-both-languages.test-cases';
import { registerCoversEveryConfigurationEnumAndReusesEditorLabelsInEnglishAndGermanReviews } from './i18n.all-official-plugins-follow-the-core-language-before-mounting-and-switch-without-remounting.test-cases';
import { registerLocalizesNestedAndIndexedDiffHeadingsWhileRetainingFullPathOverrides } from './i18n.all-official-plugins-follow-the-core-language-before-mounting-and-switch-without-remounting.test-cases';
import { registerSHasMatchingCatalogKeysAndInterpolationVariablesInBothLanguages } from './i18n.preserves-literal-configuration-identifiers-and-unknown-values-in-both-languages.test-cases';
import { registerSwitchesThePersistedCommissioningFailureS } from './i18n.preserves-literal-configuration-identifiers-and-unknown-values-in-both-languages.test-cases';
import { registerTranslatesTheActualSharedPulseValidationMessageThroughTheHostLanguageStore } from './i18n.translates-every-diagnostic-freshness-acknowledgement-and-commissioning-readiness-status.test-cases';
import { registerTranslatesRuntimeFailuresAndProtocolCompatibilityWhilePreservingTheirIdentifiersAndMeasur } from './i18n.translates-every-diagnostic-freshness-acknowledgement-and-commissioning-readiness-status.test-cases';

beforeEach(() => {
  vi.stubGlobal('localStorage', { setItem: vi.fn() });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  cleanup();
  useTranslationState.setState({ language: 'en' });
  vi.unstubAllGlobals();
});

function leaves(record: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof value === 'string'
        ? [[path, value]]
        : Object.entries(leaves(value as Record<string, unknown>, path));
    }),
  );
}
defineRootTestRegistrationsTests();

export function defineRootTestRegistrationsTests() {
  const scope = {
    leaves,
  };

  registerExplainsCleanupLockContentionInTheSelectedLanguageIncludingPartialCleanup(scope);

  registerAllOfficialPluginsFollowTheCoreLanguageBeforeMountingAndSwitchWithoutRemounting(scope);

  registerTranslatesRetainedBackendMessagesStatusesAndBuiltinNamesWhilePreservingCustomNamesAndDi(scope);

  registerLocalizesModbusAddButtonsWithoutSavingTranslatedSignalNames(scope);

  registerLocalizesPresetMetadataObjectsAndLeavesWhilePreservingUnknownPresetIdsAndNames(scope);

  registerPreservesLiteralValidationTextAndResolvesOnlyExactReferencesInRecognizedMessages(scope);

  registerTranslatesEveryDiagnosticFreshnessAcknowledgementAndCommissioningReadinessStatus(scope);

  registerLocalizesBuiltInModbusReviewNamesWhilePreservingCustomNamesAndMetadataOverrides(scope);

  registerTranslatesTheBackendOwnedReasonsThatDiagnosticSamplesAreNotCurrent(scope);

  registerResolvesModbusProfileReferencesByTheSelectedDeviceVersion(scope);

  registerUpdatesVisibleLabelsWhilePreservingAChannelCreationFormAndItsUserEnteredName(scope);

  registerSwitchesChannelPresetLabelsAndPreservesUnknownIdentifiersSS(scope);

  registerTranslatesConfigurationChoicesByFieldWithoutTranslatingUserNamesOrIdentifiers(scope);

  registerPreservesLiteralConfigurationIdentifiersAndUnknownValuesInBothLanguages(scope);

  registerCoversEveryConfigurationEnumAndReusesEditorLabelsInEnglishAndGermanReviews(scope);

  registerLocalizesNestedAndIndexedDiffHeadingsWhileRetainingFullPathOverrides(scope);

  registerSHasMatchingCatalogKeysAndInterpolationVariablesInBothLanguages(scope);

  registerSwitchesThePersistedCommissioningFailureS(scope);

  registerTranslatesTheActualSharedPulseValidationMessageThroughTheHostLanguageStore(scope);

  registerTranslatesRuntimeFailuresAndProtocolCompatibilityWhilePreservingTheirIdentifiersAndMeasur(scope);

  return scope;
}

export type RootTestRegistrationsTestScope = ReturnType<typeof defineRootTestRegistrationsTests>;
