import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useAttractapServiceGetCardWriterSettings,
  useAttractapServiceGetReaders,
} from '@attraccess/react-query-client';
import { AttractapSelect } from './index';

vi.mock('@attraccess/react-query-client', () => ({
  useAttractapServiceGetReaders: vi.fn(),
  useAttractapServiceGetCardWriterSettings: vi.fn(),
}));

const reader = (id: number, name: string, capabilities: Record<string, boolean>, lastConnection = new Date()) => ({
  id,
  name,
  lastConnection: lastConnection.toISOString(),
  firmware: { capabilities: { cardEnrollment: true, cardRelay: true, ...capabilities } },
});

const readersQuery = (data: ReturnType<typeof reader>[]) =>
  vi.mocked(useAttractapServiceGetReaders).mockReturnValue({
    data,
    isLoading: false,
  } as unknown as ReturnType<typeof useAttractapServiceGetReaders>);

const settingsQuery = (data: { mode: 'all' | 'selected'; readerIds: number[] } | undefined, isLoading = false) =>
  vi.mocked(useAttractapServiceGetCardWriterSettings).mockReturnValue({
    data,
    isLoading,
  } as ReturnType<typeof useAttractapServiceGetCardWriterSettings>);

describe('AttractapSelect for card writing', () => {
  beforeEach(() => {
    readersQuery([
      reader(1, 'Entrance', {}),
      reader(2, 'Workshop', {}),
      reader(3, 'Old firmware', { cardRelay: false }),
      reader(4, 'No display', { cardEnrollment: false }),
    ]);
  });

  const options = async () => {
    await userEvent.click(screen.getByRole('button'));
    return (await screen.findAllByRole('option')).map((option) => option.textContent);
  };

  it('offers only readers with current firmware that can enroll cards', async () => {
    vi.mocked(useAttractapServiceGetCardWriterSettings).mockReturnValue({
      data: { mode: 'all', readerIds: [] },
    } as ReturnType<typeof useAttractapServiceGetCardWriterSettings>);
    render(<AttractapSelect selection={null} onSelectionChange={vi.fn()} forCardWriting />);
    expect(await options()).toEqual(['Entrance', 'Workshop']);
  });

  it('offers only the readers the administrator selected', async () => {
    vi.mocked(useAttractapServiceGetCardWriterSettings).mockReturnValue({
      data: { mode: 'selected', readerIds: [2, 3] },
    } as ReturnType<typeof useAttractapServiceGetCardWriterSettings>);
    render(<AttractapSelect selection={null} onSelectionChange={vi.fn()} forCardWriting />);
    // Reader 3 is selected but runs old firmware, so it still cannot take part.
    expect(await options()).toEqual(['Workshop']);
  });

  it('does not apply the card writer rules to other pickers', async () => {
    vi.mocked(useAttractapServiceGetCardWriterSettings).mockReturnValue({
      data: { mode: 'selected', readerIds: [2] },
    } as ReturnType<typeof useAttractapServiceGetCardWriterSettings>);
    render(<AttractapSelect selection={null} onSelectionChange={vi.fn()} />);
    expect(await options()).toHaveLength(4);
  });

  it('lists nothing while the card enrollment setting is still loading', () => {
    settingsQuery(undefined, true);
    render(<AttractapSelect selection={null} onSelectionChange={vi.fn()} forCardWriting />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByText('Loading readers...')).toBeInTheDocument();
    expect(screen.queryByTestId('attractap-select-empty')).toBeNull();
  });

  it('falls back to the firmware check when the setting cannot be loaded', async () => {
    settingsQuery(undefined);
    render(<AttractapSelect selection={null} onSelectionChange={vi.fn()} forCardWriting />);
    expect(await options()).toEqual(['Entrance', 'Workshop']);
  });

  it.each([
    {
      reason: 'no reader is connected',
      readers: [reader(1, 'Entrance', {}, new Date(Date.now() - 60_000))],
      title: 'No reader connected',
    },
    {
      reason: 'the connected readers run old firmware',
      readers: [reader(3, 'Old firmware', { cardRelay: false }), reader(4, 'No display', { cardEnrollment: false })],
      title: 'Firmware update required',
    },
    {
      reason: 'no connected reader can enroll cards',
      readers: [reader(4, 'No display', { cardEnrollment: false })],
      title: 'No suitable reader',
    },
    {
      reason: 'the administrator allowed none of the connected readers',
      readers: [reader(1, 'Entrance', {}), reader(2, 'Workshop', {})],
      title: 'No reader allowed',
    },
  ])('explains an empty list when $reason', ({ readers, title }) => {
    readersQuery(readers);
    settingsQuery({ mode: 'selected', readerIds: [9] });
    render(<AttractapSelect selection={null} onSelectionChange={vi.fn()} forCardWriting />);
    expect(screen.getByTestId('attractap-select-empty')).toHaveTextContent(title);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('points to the card enrollment setting when no reader is allowed', () => {
    settingsQuery({ mode: 'selected', readerIds: [] });
    render(<AttractapSelect selection={null} onSelectionChange={vi.fn()} forCardWriting />);
    expect(screen.getByTestId('attractap-select-empty')).toHaveTextContent('Settings → Card enrollment');
  });

  it('does not explain an empty list for other pickers', () => {
    readersQuery([]);
    settingsQuery(undefined);
    render(<AttractapSelect selection={null} onSelectionChange={vi.fn()} />);
    expect(screen.queryByTestId('attractap-select-empty')).toBeNull();
  });
});
