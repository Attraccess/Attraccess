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

const reader = (id: number, name: string, capabilities: Record<string, boolean>) => ({
  id,
  name,
  lastConnection: new Date().toISOString(),
  firmware: { capabilities: { cardEnrollment: true, cardRelay: true, ...capabilities } },
});

describe('AttractapSelect for card writing', () => {
  beforeEach(() => {
    vi.mocked(useAttractapServiceGetReaders).mockReturnValue({
      data: [
        reader(1, 'Entrance', {}),
        reader(2, 'Workshop', {}),
        reader(3, 'Old firmware', { cardRelay: false }),
        reader(4, 'No display', { cardEnrollment: false }),
      ],
    } as ReturnType<typeof useAttractapServiceGetReaders>);
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
});
