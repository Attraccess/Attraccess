import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceScanner } from './index';

const state = vi.hoisted(() => ({
  onScan: undefined as ((codes: Array<{ rawValue: string }>) => void) | undefined,
  onError: undefined as ((error: unknown) => void) | undefined,
  toast: { error: vi.fn() },
}));

vi.mock('@yudiel/react-qr-scanner', () => ({
  boundingBox: () => undefined,
  Scanner: ({
    onScan,
    onError,
  }: {
    onScan: (codes: Array<{ rawValue: string }>) => void;
    onError: (error: unknown) => void;
  }) => {
    state.onScan = onScan;
    state.onError = onError;
    return <p>Camera</p>;
  },
}));

vi.mock('../../../../components/toastProvider', () => ({ useToastMessage: () => state.toast }));

function CurrentUrl() {
  const location = useLocation();
  return <output aria-label="Current URL">{location.pathname + location.search}</output>;
}

function mount(onDetected?: (rawValue: string) => boolean, cameraFallbackHint?: string) {
  render(
    <MemoryRouter initialEntries={['/attractap/readers']}>
      <ResourceScanner onDetected={onDetected} cameraFallbackHint={cameraFallbackHint}>
        {(open) => <button onClick={open}>Scan</button>}
      </ResourceScanner>
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
  state.onError = undefined;
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

  it('explains a denied camera permission and closes the scanner', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText('Camera');
    const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    act(() => state.onError?.(denied));

    // The resource toolbar has no code field, so the default message offers no code to type.
    expect(state.toast.error).toHaveBeenCalledWith({
      title: 'Camera access denied',
      description: 'Allow camera access for this page in your browser settings.',
    });
    await vi.waitFor(() => expect(screen.queryByText('Camera')).toBeNull());
  });

  it('reports a camera that cannot be started', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText('Camera');
    act(() => state.onError?.(new Error('no camera')));

    expect(state.toast.error).toHaveBeenCalledWith({
      title: 'Camera not available',
      description: 'The camera could not be started.',
    });
  });

  it('adds what the caller offers instead of the camera', async () => {
    mount(() => true, 'Type the code instead.');
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText('Camera');
    act(() => state.onError?.(new Error('no camera')));

    expect(state.toast.error).toHaveBeenCalledWith({
      title: 'Camera not available',
      description: 'The camera could not be started. Type the code instead.',
    });
  });
});
