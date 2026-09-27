import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AttraccessFrontendPlugin } from '@attraccess/plugins-frontend-sdk';
import type { LoadedPluginManifest } from '@attraccess/react-query-client';
import { TestWrapper } from '../../test-utils/wrappers';
import usePluginState from '../../app/plugins/plugin.state';
import { PageHeader } from './index';

vi.mock('../../app/dashboard/pins', () => ({
  DashboardPinToggle: ({ itemId }: { itemId: string }) => <button aria-label={`Pin ${itemId}`} />,
}));

function setPlugin(dashboardPaths?: string[]) {
  const plugin = {
    getSidebarItems: () => [{ path: '/plugin-report', label: 'Plugin report' }],
  } as unknown as AttraccessFrontendPlugin;
  usePluginState.setState({ plugins: [{
    name: 'report', version: '1.0.0', status: 'loaded',
    main: { frontend: dashboardPaths ? { dashboardPaths } : undefined }, plugin,
  } as unknown as LoadedPluginManifest & { plugin: AttraccessFrontendPlugin }] });
}

function renderHeader() {
  return render(<PageHeader title="Plugin report" />, {
    wrapper: ({ children }) => <TestWrapper initialRoute="/plugin-report">{children}</TestWrapper>,
  });
}

describe('PageHeader plugin dashboard pins', () => {
  it('does not show a pin for an undeclared plugin sidebar path', () => {
    setPlugin();
    renderHeader();
    expect(screen.queryByRole('button', { name: 'Pin /plugin-report' })).not.toBeInTheDocument();
  });

  it('shows a pin for a plugin sidebar path declared in its manifest', () => {
    setPlugin(['/plugin-report']);
    renderHeader();
    expect(screen.getByRole('button', { name: 'Pin /plugin-report' })).toBeInTheDocument();
  });
});
