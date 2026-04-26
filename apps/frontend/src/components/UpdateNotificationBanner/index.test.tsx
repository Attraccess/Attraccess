import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestWrapper } from '../../test-utils/wrappers';
import type { UpdateStatusDto } from '@attraccess/react-query-client';
import { DISMISSED_VERSION_STORAGE_KEY } from './storage';
import { UpdateNotificationBanner, buildUpdateDocsPath } from './index';

let mockLanguage: 'en' | 'de' = 'en';

vi.mock('@attraccess/plugins-frontend-ui', () => {
  const translations: Record<string, string> = {
    title: 'A new Attraccess release is available',
    versionSummary: 'Running {{current}} · Latest {{latest}}',
    viewReleaseNotes: 'View release notes',
    howToUpdate: 'How to update',
    dismissThisVersion: 'Dismiss for this version',
    releaseNotesModalTitle: 'Release notes for {{version}}',
    releaseNotesFallback: 'No release notes provided.',
    close: 'Close',
  };

  const t = (key: string, vars?: Record<string, unknown>) => {
    let value = translations[key] ?? key;
    if (vars) {
      Object.entries(vars).forEach(([varKey, varValue]) => {
        value = value.replace(`{{${varKey}}}`, String(varValue));
      });
    }
    return value;
  };

  const tExists = (key: string) => Boolean(translations[key]);

  return { useTranslations: () => ({ t, tExists, language: mockLanguage, setLanguage: vi.fn() }) };
});

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="markdown">{children}</div>,
}));

vi.mock('remark-gfm', () => ({ default: () => ({}) }));

let hasPermissionMock = vi.fn((_: string) => true);

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    hasPermission: hasPermissionMock,
    user: { id: 1, systemPermissions: { canManageSystemConfiguration: true } },
    isAuthenticated: true,
    isInitialized: true,
    logout: vi.fn(),
    twoFactorStatus: undefined,
    isTwoFactorStatusLoading: false,
    needsTwoFactorSetup: false,
  }),
}));

let updateStatusValue: UpdateStatusDto | undefined;

vi.mock('@attraccess/react-query-client', () => ({
  useSystemServiceGetUpdateStatus: (
    _params: unknown,
    _queryKey: unknown,
    options?: { enabled?: boolean },
  ) => ({
    data: options?.enabled === false ? undefined : updateStatusValue,
    isLoading: false,
    error: null,
  }),
}));

function buildStatus(overrides: Partial<UpdateStatusDto> = {}): UpdateStatusDto {
  return {
    currentVersion: '0.0.16',
    latestVersion: '0.1.2',
    isUpdateAvailable: true,
    checkSucceeded: true,
    latestRelease: {
      version: '0.1.2',
      tagName: 'v0.1.2',
      name: 'v0.1.2',
      body: '## Changes\n- Fixed thing',
      htmlUrl: 'https://github.com/Attraccess/Attraccess/releases/tag/v0.1.2',
      publishedAt: '2026-04-20T00:00:00Z',
    },
    ...overrides,
  };
}

describe('UpdateNotificationBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    hasPermissionMock = vi.fn((permission: string) => permission === 'canManageSystemConfiguration');
    updateStatusValue = undefined;
    mockLanguage = 'en';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the banner when an update is available and user can manage system config', () => {
    updateStatusValue = buildStatus();

    render(<UpdateNotificationBanner />, { wrapper: TestWrapper });

    expect(screen.getByTestId('update-notification-banner')).toBeInTheDocument();
    expect(screen.getByText('A new Attraccess release is available')).toBeInTheDocument();
    expect(screen.getByText('Running 0.0.16 · Latest 0.1.2')).toBeInTheDocument();
  });

  it('renders nothing when the user lacks the manage system config permission', () => {
    hasPermissionMock = vi.fn(() => false);
    updateStatusValue = buildStatus();

    render(<UpdateNotificationBanner />, { wrapper: TestWrapper });

    expect(screen.queryByTestId('update-notification-banner')).not.toBeInTheDocument();
  });

  it('renders nothing when no update is available', () => {
    updateStatusValue = buildStatus({
      isUpdateAvailable: false,
      latestVersion: '0.0.16',
    });

    render(<UpdateNotificationBanner />, { wrapper: TestWrapper });

    expect(screen.queryByTestId('update-notification-banner')).not.toBeInTheDocument();
  });

  it('renders nothing when the update check failed (no latestRelease)', () => {
    updateStatusValue = buildStatus({
      isUpdateAvailable: false,
      latestVersion: null,
      checkSucceeded: false,
      latestRelease: null,
    });

    render(<UpdateNotificationBanner />, { wrapper: TestWrapper });

    expect(screen.queryByTestId('update-notification-banner')).not.toBeInTheDocument();
  });

  it('hides the banner when the latest version is already dismissed in localStorage', () => {
    localStorage.setItem(DISMISSED_VERSION_STORAGE_KEY, '0.1.2');
    updateStatusValue = buildStatus();

    render(<UpdateNotificationBanner />, { wrapper: TestWrapper });

    expect(screen.queryByTestId('update-notification-banner')).not.toBeInTheDocument();
  });

  it('still shows the banner when a DIFFERENT (older) version was dismissed previously', () => {
    localStorage.setItem(DISMISSED_VERSION_STORAGE_KEY, '0.1.1');
    updateStatusValue = buildStatus();

    render(<UpdateNotificationBanner />, { wrapper: TestWrapper });

    expect(screen.getByTestId('update-notification-banner')).toBeInTheDocument();
  });

  it('dismiss button stores the current latest version and hides the banner', async () => {
    updateStatusValue = buildStatus();
    const user = userEvent.setup();

    render(<UpdateNotificationBanner />, { wrapper: TestWrapper });

    await user.click(screen.getByRole('button', { name: 'Dismiss for this version' }));

    await waitFor(() => {
      expect(screen.queryByTestId('update-notification-banner')).not.toBeInTheDocument();
    });
    expect(localStorage.getItem(DISMISSED_VERSION_STORAGE_KEY)).toBe('0.1.2');
  });

  it('renders the "How to update" button as a link to the English updating docs when UI is English', () => {
    updateStatusValue = buildStatus();

    render(<UpdateNotificationBanner />, { wrapper: TestWrapper });

    const howToUpdate = screen.getByText('How to update').closest('a');
    expect(howToUpdate).not.toBeNull();
    expect(howToUpdate).toHaveAttribute('href', '/docs/#/en/installation/updating');
    expect(howToUpdate).toHaveAttribute('target', '_blank');
    expect(howToUpdate?.getAttribute('rel')).toContain('noopener');
  });

  it('routes the "How to update" link to the German docs when UI language is German', () => {
    mockLanguage = 'de';
    updateStatusValue = buildStatus();

    render(<UpdateNotificationBanner />, { wrapper: TestWrapper });

    const howToUpdate = screen.getByText('How to update').closest('a');
    expect(howToUpdate).toHaveAttribute('href', '/docs/#/de/installation/updating');
  });

  it('opens a modal with the release notes when "View release notes" is clicked', async () => {
    updateStatusValue = buildStatus();
    const user = userEvent.setup();

    render(<UpdateNotificationBanner />, { wrapper: TestWrapper });

    await user.click(screen.getByRole('button', { name: 'View release notes' }));

    expect(await screen.findByText('Release notes for 0.1.2')).toBeInTheDocument();
    expect(screen.getByTestId('markdown')).toHaveTextContent('Fixed thing');
  });

  it('falls back to a placeholder when the release body is empty', async () => {
    updateStatusValue = buildStatus({
      latestRelease: {
        version: '0.1.2',
        tagName: 'v0.1.2',
        name: 'v0.1.2',
        body: '',
        htmlUrl: 'https://github.com/Attraccess/Attraccess/releases/tag/v0.1.2',
        publishedAt: '2026-04-20T00:00:00Z',
      },
    });
    const user = userEvent.setup();

    render(<UpdateNotificationBanner />, { wrapper: TestWrapper });

    await user.click(screen.getByRole('button', { name: 'View release notes' }));

    expect(await screen.findByText('No release notes provided.')).toBeInTheDocument();
    expect(screen.queryByTestId('markdown')).not.toBeInTheDocument();
  });

  it('modal links to the GitHub release page with the tag name as the button label', async () => {
    updateStatusValue = buildStatus();
    const user = userEvent.setup();

    render(<UpdateNotificationBanner />, { wrapper: TestWrapper });
    await user.click(screen.getByRole('button', { name: 'View release notes' }));

    await screen.findByText('Release notes for 0.1.2');
    const tagLabel = screen.getByText('v0.1.2');
    const tagLink = tagLabel.closest('a');
    expect(tagLink).not.toBeNull();
    expect(tagLink).toHaveAttribute(
      'href',
      'https://github.com/Attraccess/Attraccess/releases/tag/v0.1.2',
    );
    expect(tagLink).toHaveAttribute('target', '_blank');
  });
});

describe('buildUpdateDocsPath', () => {
  it('returns the EN path for "en"', () => {
    expect(buildUpdateDocsPath('en')).toBe('/docs/#/en/installation/updating');
  });

  it('returns the DE path for "de"', () => {
    expect(buildUpdateDocsPath('de')).toBe('/docs/#/de/installation/updating');
  });

  it('lower-cases the language tag before matching', () => {
    expect(buildUpdateDocsPath('DE')).toBe('/docs/#/de/installation/updating');
  });

  it('falls back to EN for an unsupported language', () => {
    expect(buildUpdateDocsPath('fr')).toBe('/docs/#/en/installation/updating');
  });

  it('falls back to EN for undefined', () => {
    expect(buildUpdateDocsPath(undefined)).toBe('/docs/#/en/installation/updating');
  });

  it('falls back to EN for an empty string', () => {
    expect(buildUpdateDocsPath('')).toBe('/docs/#/en/installation/updating');
  });
});
