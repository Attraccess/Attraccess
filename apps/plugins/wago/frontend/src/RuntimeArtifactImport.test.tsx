import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeArtifactImport } from './RuntimeArtifactImport';
import userEvent from '@testing-library/user-event';

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
let requests: Array<{ url: string; options?: RequestInit }>;
let fail: boolean;
beforeEach(() => {
  requests = [];
  fail = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      requests.push({ url, options });
      const importing = url.endsWith('/import');
      return {
        ok: !importing || !fail,
        status: fail ? 400 : 200,
        json: async () => artifact,
        text: async () => JSON.stringify(url.endsWith('/current') ? null : []),
      };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function selectFiles() {
  for (const [label, name] of [
    ['Runtime bundle (.tar)', 'runtime.tar'],
    ['Checksum (.sha256)', 'runtime.tar.sha256'],
    ['Signature (.sig)', 'runtime.tar.sig'],
  ])
    await userEvent.upload(screen.getByLabelText(label), new File(['fixture'], name));
}
function submitRelease() {
  const form = screen.getByRole('button', { name: 'Import and select release' }).closest('form');
  if (!form) throw new Error('Release import form is missing');
  fireEvent.submit(form);
}
describe('RuntimeArtifactImport', () => {
  it('reports busy during initial load and offers a retry without displaying raw network errors', async () => {
    const onBusyChange = vi.fn();
    const fetch = vi.mocked(globalThis.fetch);
    const normalFetch = fetch.getMockImplementation();
    if (!normalFetch) throw new Error('Missing fetch fixture');
    fetch.mockRejectedValue(new Error('network failure at /private/source/releases'));
    render(<RuntimeArtifactImport onBusyChange={onBusyChange} />);
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect((await screen.findByRole('alert')).textContent).toContain('Check your connection and retry');
    expect(screen.getByRole('alert').textContent).not.toContain('/private/source');
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('group').hasAttribute('disabled')).toBe(true);
    fetch.mockImplementation(normalFetch);
    await userEvent.click(screen.getByRole('button', { name: 'Retry loading releases' }));
    await screen.findByText('Import a release before commissioning a controller.');
    expect(onBusyChange.mock.calls.map(([value]) => value)).toEqual([true, false, true, false]);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('aborts a pending initial load and ignores its late result', async () => {
    let complete!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      complete = resolve;
    });
    vi.mocked(fetch).mockReturnValue(pending);
    const onBusyChange = vi.fn();
    const { unmount } = render(<RuntimeArtifactImport onBusyChange={onBusyChange} />);
    const signals = vi.mocked(fetch).mock.calls.map(([, options]) => options?.signal);
    unmount();
    expect(signals.every((signal) => signal?.aborted)).toBe(true);
    await act(async () => {
      complete({ ok: true, text: async () => JSON.stringify(artifact) } as Response);
    });
    expect(onBusyChange.mock.calls.map(([value]) => value)).toEqual([true, false]);
  });
  it.each(['fetch', 'json'])('aborts uploads on unmount and ignores late %s completion', async (phase) => {
    const onImported = vi.fn();
    const onBusyChange = vi.fn();
    const { unmount } = render(<RuntimeArtifactImport onImported={onImported} onBusyChange={onBusyChange} />);
    await screen.findByText('Import a release before commissioning a controller.');
    await selectFiles();
    let complete!: () => void;
    const json = vi.fn(async () => artifact);
    const response = { ok: true, json } as unknown as Response;
    if (phase === 'fetch') {
      vi.mocked(fetch).mockReturnValueOnce(
        new Promise((resolve) => {
          complete = () => resolve(response);
        }),
      );
    } else {
      json.mockReturnValueOnce(
        new Promise((resolve) => {
          complete = () => resolve(artifact);
        }),
      );
      vi.mocked(fetch).mockResolvedValueOnce(response);
    }
    submitRelease();
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true));
    if (phase === 'json') await waitFor(() => expect(json).toHaveBeenCalled());
    const calls = vi.mocked(fetch).mock.calls;
    const options = calls[calls.length - 1]?.[1];
    expect(options?.signal?.aborted).toBe(false);
    unmount();
    expect(options?.signal?.aborted).toBe(true);
    await act(async () => complete());
    expect(onImported).not.toHaveBeenCalled();
    expect(onBusyChange.mock.calls.map(([value]) => value)).toEqual([true, false, true, false]);
    if (phase === 'fetch') expect(json).not.toHaveBeenCalled();
  });
  it('keeps upload files after a network failure and allows an explicit retry', async () => {
    const onImported = vi.fn();
    render(<RuntimeArtifactImport onImported={onImported} />);
    await screen.findByText('Import a release before commissioning a controller.');
    await selectFiles();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Failed to fetch /private/artifacts/runtime.tar'));
    const submit = submitRelease;
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain('Check your connection');
    expect(screen.getByRole('alert').textContent).not.toContain('/private/artifacts');
    expect((screen.getByLabelText('Runtime bundle (.tar)') as HTMLInputElement).files).toHaveLength(1);
    submit();
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(artifact));
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('uploads the selected files as multipart with host cookies and reports verified activation', async () => {
    const onImported = vi.fn();
    render(<RuntimeArtifactImport onImported={onImported} />);
    await screen.findByText('Import a release before commissioning a controller.');
    expect(screen.getByRole('button', { name: 'Import and select release' }).hasAttribute('disabled')).toBe(true);
    await selectFiles();
    expect((screen.getByLabelText('Runtime bundle (.tar)') as HTMLInputElement).files?.length).toBe(1);
    // jsdom reports required file inputs as invalid even after userEvent.upload.
    // Dispatch the browser's validated form submission directly.
    fireEvent.submit(
      screen.getByRole('button', { name: 'Import and select release' }).closest('form') as HTMLFormElement,
    );
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(artifact));
    const imported = requests.filter(({ url }) => url.endsWith('/import'));
    expect(imported).toHaveLength(1);
    const body = imported[0].options?.body;
    expect(body).toBeInstanceOf(FormData);
    expect(Array.from((body as FormData).keys())).toEqual(['bundle', 'checksum', 'signature']);
    expect(imported[0].options?.credentials).toBe('include');
    expect(imported[0].options?.headers).toBeUndefined();
    expect(screen.getByRole('status').textContent).toContain('Release verified');
    expect(screen.getByRole('button', { name: 'Import and select release' }).hasAttribute('disabled')).toBe(true);
  });
  it('retains file selections on rejection and never reports activation or retries automatically', async () => {
    fail = true;
    const onImported = vi.fn();
    render(<RuntimeArtifactImport onImported={onImported} />);
    await screen.findByText('Import a release before commissioning a controller.');
    await selectFiles();
    fireEvent.submit(
      screen.getByRole('button', { name: 'Import and select release' }).closest('form') as HTMLFormElement,
    );
    await screen.findByRole('alert');
    expect(onImported).not.toHaveBeenCalled();
    expect(requests.filter(({ url }) => url.endsWith('/import'))).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Import and select release' }).hasAttribute('disabled')).toBe(false);
  });
  it('honors disabled administration controls', async () => {
    render(<RuntimeArtifactImport disabled />);
    await screen.findByText('Import a release before commissioning a controller.');
    expect(screen.getByRole('group').hasAttribute('disabled')).toBe(true);
    expect(requests.every(({ options }) => options?.method !== 'POST')).toBe(true);
  });
});
