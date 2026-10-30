import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceScanner } from './index';

const state = vi.hoisted(() => ({
  onScan: undefined as ((codes: Array<{ rawValue: string }>) => void) | undefined,
  toast: { error: vi.fn() },
}));

vi.mock('@yudiel/react-qr-scanner', () => ({
  boundingBox: () => undefined,
  Scanner: ({ onScan }: { onScan: (codes: Array<{ rawValue: string }>) => void }) => {
    state.onScan = onScan;
    return <p>Camera</p>;
  },
}));

vi.mock('../../../../components/toastProvider', () => ({ useToastMessage: () => state.toast }));

function CurrentUrl() {
  const location = useLocation();
  return <output aria-label="Current URL">{location.pathname + location.search}</output>;
}

function mount(onDetected?: (rawValue: string) => boolean) {
  render(
    <MemoryRouter initialEntries={['/attractap/readers']}>
      <ResourceScanner onDetected={onDetected}>{(open) => <button onClick={open}>Scan</button>}</ResourceScanner>
      <CurrentUrl />
    </MemoryRouter>,
  );
}

function emit(rawValue: string) {
  if (!state.onScan) throw new Error('The scanner is not open');
  state.onScan([{ rawValue }]);
}

async function scan(rawValue: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
  await screen.findByText('Camera');
  act(() => emit(rawValue));
}

const currentUrl = () => screen.getByRole('status', { name: 'Current URL' });

beforeEach(() => {
  vi.clearAllMocks();
  state.onScan = undefined;
});
afterEach(cleanup);

describe('ResourceScanner', () => {
  it('opens a scanned link of this app', async () => {
    mount();
    await scan(`${window.location.origin}/resources/4?tab=x`);

    expect(currentUrl()).toHaveTextContent('/resources/4?tab=x');
    expect(state.toast.error).not.toHaveBeenCalled();
  });

  it('refuses links of other addresses', async () => {
    mount();
    await scan('https://elsewhere.example.com/resources/4');

    expect(currentUrl()).toHaveTextContent('/attractap/readers');
    expect(state.toast.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'Wrong origin' }));
  });

  it('reports content that is not a link instead of throwing', async () => {
    mount();
    await scan('just some text');

    expect(currentUrl()).toHaveTextContent('/attractap/readers');
    expect(state.toast.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'Unknown QR code' }));
  });

  it('lets the caller take the scan instead of navigating', async () => {
    const onDetected = vi.fn((rawValue: string) => rawValue === 'K7P3XQ');
    mount(onDetected);

    await scan('nope');
    expect(state.toast.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'Unknown QR code' }));
    expect(screen.getByText('Camera')).toBeInTheDocument();

    act(() => emit(`${window.location.origin}/?enroll=K7P3XQ`));
    act(() => emit('K7P3XQ'));
    expect(onDetected).toHaveBeenLastCalledWith('K7P3XQ');
    expect(currentUrl()).toHaveTextContent('/attractap/readers');
    await vi.waitFor(() => expect(screen.queryByText('Camera')).toBeNull());
  });
});
