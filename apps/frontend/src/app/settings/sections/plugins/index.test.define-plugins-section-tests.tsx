import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { PluginsSection } from './index';
import { registerRendersTheSectionHeadingInstallMenuAndTableHeaders } from './index.renders-community-for-an-installed-plugin-until-its-npm-classification-is-available.test-cases';
import { registerChecksMarketplacePluginsForUpdatesAndTakesTheAdminToTheInPlaceUpdateFlow } from './index.calls-delete-plugin-with-the-plugin-id-when-deletion-is-confirmed.test-cases';
import { registerReportsFailedPackageUpdateChecks } from './index.renders-community-for-an-installed-plugin-until-its-npm-classification-is-available.test-cases';
import { registerRendersTheOfficialMarketplaceClassification } from './index.renders-community-for-an-installed-plugin-until-its-npm-classification-is-available.test-cases';
import { registerClosesTheMarketplaceWithItsCancelButton } from './index.calls-delete-plugin-with-the-plugin-id-when-deletion-is-confirmed.test-cases';
import { registerUsesExactPackageLookupWhenASelectedRegistryCannotBeSearched } from './index.retries-a-failed-plugin-when-the-restarted-server-becomes-available-without-observing-downtime.test-cases';
import { registerKeepsIncompatibleMarketplacePackagesVisibleWithTheirReason } from './index.installs-an-exact-private-package-version-from-its-selected-registry.test-cases';
import { registerRequiresSourceAndPermissionAcknowledgementBeforeInstalling } from './index.renders-community-for-an-installed-plugin-until-its-npm-classification-is-available.test-cases';
import { registerInstallsAnExactPrivatePackageVersionFromItsSelectedRegistry } from './index.installs-an-exact-private-package-version-from-its-selected-registry.test-cases';
import { registerKeepsTheInstallFailureAndCompatibilityRemedyVisibleInTheInstallConfirmationModal } from './index.installs-an-exact-private-package-version-from-its-selected-registry.test-cases';
import { registerShowsOnlyTheConfiguredStateForRegistryTokens } from './index.retries-a-failed-plugin-when-the-restarted-server-becomes-available-without-observing-downtime.test-cases';
import { registerKeepsTheLatestRegistryRefreshWhenAnEarlierLoadCompletesLate } from './index.installs-an-exact-private-package-version-from-its-selected-registry.test-cases';
import { registerDoesNotReportARegistryAddAsSuccessfulWhenItsRefreshFails } from './index.calls-delete-plugin-with-the-plugin-id-when-deletion-is-confirmed.test-cases';
import { registerKeepsANewerTestForTheSameRegistryPendingWhenAnEarlierTestCompletes } from './index.installs-an-exact-private-package-version-from-its-selected-registry.test-cases';
import { registerRendersCommunityForAnInstalledPluginUntilItsNpmClassificationIsAvailable } from './index.renders-community-for-an-installed-plugin-until-its-npm-classification-is-available.test-cases';
import { registerReportsRegistrySearchFailuresAlongsidePartialMarketplaceResults } from './index.renders-community-for-an-installed-plugin-until-its-npm-classification-is-available.test-cases';
import { registerOpensPackageDetailsInTheMarketplaceAndReturnsToTheCatalog } from './index.keeps-the-marketplace-loading-indicator-visible-while-details-are-pending-after-a-search-completes.test-cases';
import { registerDiscardsDetailResponsesThatArriveAfterClosingTheMarketplace } from './index.calls-delete-plugin-with-the-plugin-id-when-deletion-is-confirmed.test-cases';
import { registerOpensDetailsWhenADebouncedSearchStartsAfterTheDetailsClick } from './index.keeps-the-marketplace-loading-indicator-visible-while-details-are-pending-after-a-search-completes.test-cases';
import { registerKeepsTheMarketplaceLoadingIndicatorVisibleWhileDetailsArePendingAfterASearchCompletes } from './index.keeps-the-marketplace-loading-indicator-visible-while-details-are-pending-after-a-search-completes.test-cases';
import { registerShowsAPluginLoadErrorInAModal } from './index.retries-a-failed-plugin-when-the-restarted-server-becomes-available-without-observing-downtime.test-cases';
import { registerRetriesAFailedPluginWhenTheRestartedServerBecomesAvailableWithoutObservingDowntime } from './index.retries-a-failed-plugin-when-the-restarted-server-becomes-available-without-observing-downtime.test-cases';
import { registerKeepsTheRetryActionPendingWhileItWaitsForTheRestartedServer } from './index.keeps-the-marketplace-loading-indicator-visible-while-details-are-pending-after-a-search-completes.test-cases';
import { registerRendersARowPerPluginWithNameVersionDirectoryAndPermissionChips } from './index.keeps-the-marketplace-loading-indicator-visible-while-details-are-pending-after-a-search-completes.test-cases';
import { registerFallsBackToADashForAMissingDirectoryAndNoneRequestedForNoPermissions } from './index.calls-delete-plugin-with-the-plugin-id-when-deletion-is-confirmed.test-cases';
import { registerOpensTheUploadDrawerWhenTheUploadButtonIsPressed } from './index.keeps-the-marketplace-loading-indicator-visible-while-details-are-pending-after-a-search-completes.test-cases';
import { registerOpensTheDeleteConfirmationModalWhenADeleteButtonIsPressed } from './index.keeps-the-marketplace-loading-indicator-visible-while-details-are-pending-after-a-search-completes.test-cases';
import { registerCallsDeletePluginWithThePluginIdWhenDeletionIsConfirmed } from './index.calls-delete-plugin-with-the-plugin-id-when-deletion-is-confirmed.test-cases';
import { registerShowsASuccessToastAfterASuccessfulDelete } from './index.retries-a-failed-plugin-when-the-restarted-server-becomes-available-without-observing-downtime.test-cases';
import { registerShowsAnErrorToastWhenTheDeleteFails } from './index.retries-a-failed-plugin-when-the-restarted-server-becomes-available-without-observing-downtime.test-cases';
import { registerCancelsTheDeleteWithoutCallingTheMutation } from './index.calls-delete-plugin-with-the-plugin-id-when-deletion-is-confirmed.test-cases';
import { registerRendersPermissionChipsScopedToThePluginRow } from './index.renders-community-for-an-installed-plugin-until-its-npm-classification-is-available.test-cases';
import { hoisted } from './index.test.hoisted';
import { makePlugin } from './index.test.deferred.helpers';
import { deferred } from './index.test.deferred.helpers';

export function definePluginsSectionTests() {
  const scope = {
    get hoisted() {
      return hoisted;
    },
    makePlugin,
    get openMarketplace() {
      return openMarketplace;
    },
    deferred,
  };
  registerRendersTheSectionHeadingInstallMenuAndTableHeaders(scope);

  registerChecksMarketplacePluginsForUpdatesAndTakesTheAdminToTheInPlaceUpdateFlow(scope);

  registerReportsFailedPackageUpdateChecks(scope);

  async function openMarketplace(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Install plugin' }));
    await user.click(screen.getByText('Browse marketplace'));
  }

  registerRendersTheOfficialMarketplaceClassification(scope);

  registerClosesTheMarketplaceWithItsCancelButton(scope);

  registerUsesExactPackageLookupWhenASelectedRegistryCannotBeSearched(scope);

  registerKeepsIncompatibleMarketplacePackagesVisibleWithTheirReason(scope);

  registerRequiresSourceAndPermissionAcknowledgementBeforeInstalling(scope);

  registerInstallsAnExactPrivatePackageVersionFromItsSelectedRegistry(scope);

  registerKeepsTheInstallFailureAndCompatibilityRemedyVisibleInTheInstallConfirmationModal(scope);

  registerShowsOnlyTheConfiguredStateForRegistryTokens(scope);

  registerKeepsTheLatestRegistryRefreshWhenAnEarlierLoadCompletesLate(scope);

  registerDoesNotReportARegistryAddAsSuccessfulWhenItsRefreshFails(scope);

  registerKeepsANewerTestForTheSameRegistryPendingWhenAnEarlierTestCompletes(scope);

  registerRendersCommunityForAnInstalledPluginUntilItsNpmClassificationIsAvailable(scope);

  registerReportsRegistrySearchFailuresAlongsidePartialMarketplaceResults(scope);

  registerOpensPackageDetailsInTheMarketplaceAndReturnsToTheCatalog(scope);

  registerDiscardsDetailResponsesThatArriveAfterClosingTheMarketplace(scope);

  registerOpensDetailsWhenADebouncedSearchStartsAfterTheDetailsClick(scope);

  registerKeepsTheMarketplaceLoadingIndicatorVisibleWhileDetailsArePendingAfterASearchCompletes(scope);

  registerShowsAPluginLoadErrorInAModal(scope);

  it('warns when plugins are globally disabled', async () => {
    hoisted.pluginSystemStatus = { disabled: true, instanceId: 'original-instance' };
    render(<PluginsSection />);

    expect(await screen.findByText('Plugins are disabled')).toBeInTheDocument();
  });

  it('marks a successfully loaded plugin', () => {
    hoisted.plugins = [makePlugin({ status: 'loaded', error: null })];
    render(<PluginsSection />);

    expect(screen.getByText('Loaded')).toBeInTheDocument();
  });

  registerRetriesAFailedPluginWhenTheRestartedServerBecomesAvailableWithoutObservingDowntime(scope);

  registerKeepsTheRetryActionPendingWhileItWaitsForTheRestartedServer(scope);

  it('shows the empty state when no plugins are installed', () => {
    render(<PluginsSection />);

    expect(screen.getByText('No entries found')).toBeInTheDocument();
  });

  registerRendersARowPerPluginWithNameVersionDirectoryAndPermissionChips(scope);

  registerFallsBackToADashForAMissingDirectoryAndNoneRequestedForNoPermissions(scope);

  registerOpensTheUploadDrawerWhenTheUploadButtonIsPressed(scope);

  registerOpensTheDeleteConfirmationModalWhenADeleteButtonIsPressed(scope);

  registerCallsDeletePluginWithThePluginIdWhenDeletionIsConfirmed(scope);

  registerShowsASuccessToastAfterASuccessfulDelete(scope);

  registerShowsAnErrorToastWhenTheDeleteFails(scope);

  registerCancelsTheDeleteWithoutCallingTheMutation(scope);

  registerRendersPermissionChipsScopedToThePluginRow(scope);

  return scope;
}
