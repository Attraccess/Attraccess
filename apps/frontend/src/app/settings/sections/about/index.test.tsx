import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGetCurrentVersion, useGetSystemInfo, useGetUpdateStatus } from '@attraccess/react-query-client';
import { AboutSection } from './index';

vi.mock('@attraccess/react-query-client', () => ({
  useGetCurrentVersion: vi.fn(),
  useGetUpdateStatus: vi.fn(),
  useGetSystemInfo: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key }),
    useFormatedDuration: () => '2 hours',
  }))()),
}));

describe('AboutSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetCurrentVersion).mockReturnValue({
      data: { version: '1.2.3', commitHash: 'abcdef1234567890' },
      isLoading: false,
    } as ReturnType<typeof useGetCurrentVersion>);
    vi.mocked(useGetUpdateStatus).mockReturnValue({
      data: { checkSucceeded: true, isUpdateAvailable: false },
    } as ReturnType<typeof useGetUpdateStatus>);
    vi.mocked(useGetSystemInfo).mockReturnValue({
      data: {
        usersTotal: 12,
        resourcesTotal: 7,
        projectsTotal: 3,
        activeAuthSessions: 4,
        activeResourceUsageSessions: 1,
        uptimeSeconds: 7200,
        nodeVersion: 'v22.11.0',
      },
    } as ReturnType<typeof useGetSystemInfo>);
  });

  it('keeps the version and system totals reachable after the settings redesign', () => {
    // `/settings` was their only mount point via SystemSettingsPage; this section is what stops the
    // redesign from dropping them.
    render(<AboutSection />);

    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
    expect(screen.getByText('abcdef12')).toBeInTheDocument();
    expect(screen.getByTestId('about-users')).toHaveTextContent('12');
    expect(screen.getByTestId('about-nodeVersion')).toHaveTextContent('v22.11.0');
    expect(screen.getByTestId('about-uptime')).toHaveTextContent('2 hours');
  });

  it('surfaces an available update with a link to the release', () => {
    vi.mocked(useGetUpdateStatus).mockReturnValue({
      data: {
        checkSucceeded: true,
        isUpdateAvailable: true,
        latestVersion: '2.0.0',
        latestRelease: { htmlUrl: 'https://github.com/Attraccess/Attraccess/releases/tag/v2.0.0' },
      },
    } as ReturnType<typeof useGetUpdateStatus>);

    render(<AboutSection />);

    expect(screen.getByTestId('about-update-status')).toHaveTextContent('version.updateAvailable');
    expect(screen.getByRole('link', { name: 'version.viewRelease' })).toHaveAttribute(
      'href',
      'https://github.com/Attraccess/Attraccess/releases/tag/v2.0.0',
    );
  });
});
