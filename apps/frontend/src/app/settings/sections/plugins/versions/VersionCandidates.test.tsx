import type { InstalledPluginVersionDto } from '@attraccess/react-query-client';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VersionCandidates } from './VersionCandidates';

const version = (overrides: Partial<InstalledPluginVersionDto>): InstalledPluginVersionDto =>
  ({
    version: '1.0.0',
    direction: 'older',
    compatible: true,
    permissionAdditions: [],
    permissionRemovals: [],
    ...overrides,
  }) as InstalledPluginVersionDto;

const versions = [
  version({ version: '3.0.0', direction: 'newer', compatible: false, reason: 'Needs a newer host' }),
  version({ version: '2.0.0', direction: 'current' }),
  version({ version: '1.9.0', direction: 'older' }),
  version({ version: '1.0.0', direction: 'older', compatible: false, reason: 'Targets SDK 1.x' }),
  version({ version: '0.9.0', direction: 'older', compatible: false, reason: 'Targets SDK 1.x' }),
];

describe('VersionCandidates', () => {
  it('folds older incompatible versions away until asked for', async () => {
    const user = userEvent.setup();
    render(<VersionCandidates versions={versions} isLoading={false} selectedVersion={null} onSelect={vi.fn()} />);

    expect(screen.getByRole('radio', { name: /^3\.0\.0/ })).toBeDisabled();
    expect(screen.getByText('Not compatible: Needs a newer host')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^2\.0\.0/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^1\.9\.0/ })).toBeEnabled();
    expect(screen.queryByRole('radio', { name: /^1\.0\.0/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show 2 older incompatible versions' }));
    expect(screen.getByRole('radio', { name: /^1\.0\.0/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^0\.9\.0/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Hide older incompatible versions' }));
    expect(screen.queryByRole('radio', { name: /^0\.9\.0/ })).not.toBeInTheDocument();
  });

  it('offers no toggle when every older version is compatible', () => {
    render(
      <VersionCandidates versions={versions.slice(0, 3)} isLoading={false} selectedVersion={null} onSelect={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /incompatible/ })).not.toBeInTheDocument();
  });

  it('selects a version from anywhere in its row, never a disabled one', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<VersionCandidates versions={versions} isLoading={false} selectedVersion={null} onSelect={onSelect} />);

    await user.click(screen.getByText('2.0.0'));
    expect(onSelect).not.toHaveBeenCalled();
    await user.click(screen.getByText('1.9.0'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ version: '1.9.0' }));
  });

  it('labels the publish date and explains an incompatibility without a reason', () => {
    render(
      <VersionCandidates
        versions={[
          version({ version: '4.0.0', direction: 'newer', compatible: false, publishedAt: '2026-01-02T10:00:00Z' }),
        ]}
        isLoading={false}
        selectedVersion={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(/^Published: /)).toBeInTheDocument();
    expect(screen.getByText('Not compatible with this Attraccess version')).toBeInTheDocument();
  });

  it('says that no versions are available only once loading finished', () => {
    const { rerender } = render(
      <VersionCandidates versions={[]} isLoading selectedVersion={null} onSelect={vi.fn()} />,
    );
    expect(screen.queryByText('No other versions are available.')).not.toBeInTheDocument();
    rerender(<VersionCandidates versions={[]} isLoading={false} selectedVersion={null} onSelect={vi.fn()} />);
    expect(screen.getByText('No other versions are available.')).toBeInTheDocument();
  });
});
