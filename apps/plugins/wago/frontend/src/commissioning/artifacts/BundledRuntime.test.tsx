import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { BundledRuntime } from './BundledRuntime';

const artifact = {
  digest: 'a'.repeat(64),
  bytes: 4096,
  image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'b'.repeat(64)}`,
  manifest: {
    schemaVersion: 1,
    runtime: 'attraccess-wago-cc100',
    runtimeVersion: '0.1.0',
    protocolVersion: '1.0.0',
    hardware: {
      model: '751-9301',
      platform: 'linux/arm/v7',
      firmwareBaseline: '31',
      profile: 'cc100-751-9301-fw31-digital-v1',
    },
  },
};
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, text: async () => 'null' })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('BundledRuntime', () => {
  it('never offers custom runtime uploads when the bundled runtime is missing', async () => {
    const onSelectionChange = vi.fn();
    const { container } = render(<BundledRuntime onSelectionChange={onSelectionChange} />);
    await screen.findByText(/pnpm nx run plugin-wago:install-runtime-dev/);
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import and select release' })).toBeNull();
    expect(onSelectionChange).toHaveBeenLastCalledWith(null);
  });
  it('shows the server release and makes no upload or catalog selection requests', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, text: async () => JSON.stringify(artifact) } as Response);
    const onSelectionChange = vi.fn();
    const { container } = render(<BundledRuntime onSelectionChange={onSelectionChange} />);
    await screen.findByText(/^Selected: 0.1.0/);
    await waitFor(() => expect(onSelectionChange).toHaveBeenLastCalledWith(artifact));
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/api/wago/runtime-artifacts/current',
    ]);
  });
  it('rechecks after the local runtime has been built and installed', async () => {
    const onBusyChange = vi.fn();
    render(<BundledRuntime onBusyChange={onBusyChange} />);
    await screen.findByText(/pnpm nx run plugin-wago:install-runtime-dev/);
    vi.mocked(fetch).mockResolvedValue({ ok: true, text: async () => JSON.stringify(artifact) } as Response);
    await userEvent.click(screen.getByRole('button', { name: 'Check runtime again' }));
    await screen.findByText(/^Selected: 0.1.0/);
    await waitFor(() => expect(onBusyChange.mock.calls.map(([value]) => value)).toEqual([true, false, true, false]));
  });
  it('reports load failures safely and allows a retry', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network failure at /private/source/releases'));
    render(<BundledRuntime />);
    expect((await screen.findByRole('alert')).textContent).toContain('Check your connection and retry');
    expect(screen.getByRole('alert').textContent).not.toContain('/private/source');
    vi.mocked(fetch).mockResolvedValue({ ok: true, text: async () => 'null' } as Response);
    await userEvent.click(screen.getByRole('button', { name: 'Check runtime again' }));
    await screen.findByText(/pnpm nx run plugin-wago:install-runtime-dev/);
  });
  it('aborts loading on unmount and ignores a late result', async () => {
    let complete!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
    );
    const onBusyChange = vi.fn();
    const onSelectionChange = vi.fn();
    const { unmount } = render(<BundledRuntime onBusyChange={onBusyChange} onSelectionChange={onSelectionChange} />);
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => complete({ ok: true, text: async () => JSON.stringify(artifact) } as Response));
    expect(onBusyChange.mock.calls.map(([value]) => value)).toEqual([true, false]);
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenLastCalledWith(null);
  });
});
