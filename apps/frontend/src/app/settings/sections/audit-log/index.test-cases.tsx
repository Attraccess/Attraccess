import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';
import { it } from 'vitest';
import type { AuditAdminWorkflowsTestScope } from './index.test';
import { within } from '@testing-library/react';
import { waitFor } from '@testing-library/react';

export function registerDistinguishesFailedLoadingFromAnEmptyResultAndLetsTheUserRetry(
  scope: AuditAdminWorkflowsTestScope,
): void {
  it('distinguishes failed loading from an empty result and lets the user retry', async () => {
    scope.list.mockRejectedValueOnce(new Error('offline'));
    scope.mount();
    expect(await screen.findByText('Activity could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText('No activity found')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'View event #52' })).toBeInTheDocument();
  });
}

export function registerDoesNotRequestOrOfferManagementSettingsToReadOnlyAuditUsers(
  scope: AuditAdminWorkflowsTestScope,
): void {
  it('does not request or offer management settings to read-only audit users', async () => {
    scope.permissions.delete('system.settings.manage');
    scope.mount();
    await screen.findByRole('button', { name: 'View event #52' });
    expect(scope.getSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole('tab', { name: 'Logging settings' })).not.toBeInTheDocument();
  });
}

export function registerExplainsMissingSnapshotsAndPreservesChangedFieldMetadata(
  scope: AuditAdminWorkflowsTestScope,
): void {
  it('explains missing snapshots and preserves changed-field metadata', async () => {
    scope.list.mockResolvedValue({
      items: [{ ...scope.entry, details: { changedFields: '["password"]' } }],
      nextCursor: null,
    });
    scope.mount();
    await userEvent.click(await screen.findByRole('button', { name: 'View event #52' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Password')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Not recorded')).toHaveLength(2);
    const changedFields = within(dialog).getByText(/\[\s*"password"\s*\]/);
    expect(JSON.parse(changedFields.textContent ?? '')).toEqual(['password']);
  });
}

export function registerKeepsAnUnsavedDomainSelectionAfterASaveFailure(scope: AuditAdminWorkflowsTestScope): void {
  it('keeps an unsaved domain selection after a save failure', async () => {
    scope.updateSettings.mockRejectedValue(new Error('offline'));
    scope.mount();
    await userEvent.click(await screen.findByRole('tab', { name: 'Logging settings' }));
    await userEvent.click(await screen.findByRole('switch', { name: 'Demo devices' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Settings could not be saved. Your changes are still available.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Demo devices' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });
}

export function registerKeepsMalformedChangeMetadataVisibleAndIdentifiesCurrentNamesInTheEventDetails(
  scope: AuditAdminWorkflowsTestScope,
): void {
  it('keeps malformed change metadata visible and identifies current names in the event details', async () => {
    scope.list.mockResolvedValue({
      items: [
        {
          ...scope.entry,
          actorUsernameSource: 'current',
          subjectLabelSource: 'current',
          details: { changedFields: '["truncated' },
        },
      ],
      nextCursor: null,
    });
    scope.mount();
    await userEvent.click(await screen.findByRole('button', { name: 'View event #52' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('["truncated')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Current name; may have changed since this event')).toHaveLength(2);
    expect(within(dialog).getByText('#7')).toBeInTheDocument();
    expect(within(dialog).getByText('resource #2')).toBeInTheDocument();
  });
}

export function registerOpensAReadableChangeComparisonAndExposesOnlyChangedFields(
  scope: AuditAdminWorkflowsTestScope,
): void {
  it('opens a readable change comparison and exposes only changed fields', async () => {
    scope.mount();
    await userEvent.click(await screen.findByRole('button', { name: 'View event #52' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('What changed')).toBeInTheDocument();
    expect(within(dialog).getByText('Enabled')).toBeInTheDocument();
    expect(within(dialog).getByText('false')).toBeInTheDocument();
    expect(within(dialog).getByText('true')).toBeInTheDocument();
    expect(within(dialog).queryByText('Interval')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Workshop admin')).toBeInTheDocument();
  });
}

export function registerPreservesOtherDomainsWhenAPluginDomainIsSwitchedOffSavesAndDisplaysPersistedSettings(
  scope: AuditAdminWorkflowsTestScope,
): void {
  it('preserves other domains when a plugin domain is switched off, saves and displays persisted settings', async () => {
    scope.mount();
    await userEvent.click(await screen.findByRole('tab', { name: 'Logging settings' }));
    await userEvent.click(await screen.findByRole('switch', { name: 'Demo devices' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(scope.updateSettings).toHaveBeenCalledWith({
        requestBody: { ...scope.settings, plugin_domains_disabled: ['demo'] },
      }),
    );
    expect(await screen.findByText('Logging settings saved.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Billing' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Resources' })).toBeChecked();
  });
}

export function registerReturnsFromTheOlderPageWithoutSendingTheInvalidZeroCursor(
  scope: AuditAdminWorkflowsTestScope,
): void {
  it('returns from the older page without sending the invalid zero cursor', async () => {
    scope.list.mockImplementation(async ({ beforeId }) => ({
      items: [{ ...scope.entry, id: beforeId ? 50 : 52 }],
      nextCursor: beforeId ? null : 51,
    }));
    scope.mount();
    await screen.findByRole('button', { name: 'View event #52' });
    await userEvent.click(screen.getByRole('button', { name: 'Older' }));
    await screen.findByRole('button', { name: 'View event #50' });
    await userEvent.click(screen.getByRole('button', { name: 'Newer' }));
    await screen.findByRole('button', { name: 'View event #52' });
    expect(scope.list.mock.calls.some(([query]) => query.beforeId === 51)).toBe(true);
    expect(scope.list.mock.calls.some(([query]) => query.beforeId === 0)).toBe(false);
  });
}

export function registerShowsLocalizedSettingsAndPreservesApiTokenAndRequestProvenanceInTheDetails(
  scope: AuditAdminWorkflowsTestScope,
): void {
  it('shows localized settings and preserves API-token and request provenance in the details', async () => {
    scope.list.mockResolvedValue({
      items: [
        {
          ...scope.entry,
          domain: 'administration',
          action: 'settings.updated',
          subjectType: 'setting',
          subjectId: 123456,
          authenticationMethod: 'api-token',
          apiTokenId: 19,
          ipAddress: '192.0.2.7',
          userAgent: 'Audit verification client',
          details: { settingKey: 'audit.enabled', before: 'true', after: 'false' },
        },
      ],
      nextCursor: null,
    });
    scope.mount();
    await userEvent.click(await screen.findByRole('button', { name: 'View event #52' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Audit logging')).toBeInTheDocument();
    expect(within(dialog).getByText('settings.updated')).toBeInTheDocument();
    expect(within(dialog).getByText('setting #123456')).toBeInTheDocument();
    expect(within(dialog).getByText('api-token')).toBeInTheDocument();
    expect(within(dialog).getByText('#19')).toBeInTheDocument();
    expect(within(dialog).getByText('192.0.2.7')).toBeInTheDocument();
    expect(within(dialog).getByText('Audit verification client')).toBeInTheDocument();
    expect(within(dialog).getByText('audit.enabled')).toBeInTheDocument();
  });
}

export function registerValidatesIdsBeforeApplyingFiltersAndPreservesTheCurrentResultOnInvalidInput(
  scope: AuditAdminWorkflowsTestScope,
): void {
  it('validates IDs before applying filters and preserves the current result on invalid input', async () => {
    scope.mount();
    await screen.findByRole('button', { name: 'View event #52' });
    await userEvent.click(screen.getByRole('button', { name: 'More filters' }));
    await userEvent.type(screen.getByLabelText('Actor ID'), '-1');
    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(await screen.findByText('Actor and target IDs must be positive whole numbers.')).toBeInTheDocument();
    expect(scope.list.mock.calls.some(([query]) => query.actorId === -1)).toBe(false);
    await userEvent.clear(screen.getByLabelText('Actor ID'));
    await userEvent.type(screen.getByLabelText('Actor ID'), '7');
    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() =>
      expect(scope.list).toHaveBeenLastCalledWith(expect.objectContaining({ actorId: 7, beforeId: undefined })),
    );
  });
}
