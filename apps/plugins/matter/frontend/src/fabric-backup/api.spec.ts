// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FabricApiError, backUpNow, confirmRestore, downloadBackup, getFabricStatus, readFileAsBase64 } from './api';

const respond = (body: string | null, status = 200) => Promise.resolve(new Response(body, { status }));

describe('fabric & backup API', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('parses JSON, sends bodies as JSON and resolves an empty response to null', async () => {
    fetchMock.mockReturnValueOnce(respond('{"sidecar":{}}'));
    await expect(getFabricStatus()).resolves.toEqual({ sidecar: {} });
    fetchMock.mockReturnValueOnce(respond(''));
    await expect(confirmRestore('v1', 'FAB-1')).resolves.toBeNull();
    const [url, init] = fetchMock.mock.calls[1];
    expect(String(url)).toMatch(/\/api\/matter\/restore\/confirm$/);
    expect(init).toMatchObject({ method: 'POST', body: '{"validationId":"v1","confirmFabricId":"FAB-1"}' });
  });

  it('keeps the backend code and message of an error response', async () => {
    fetchMock.mockReturnValueOnce(respond('{"code":"busy","message":"Busy."}', 409));
    const error = await backUpNow().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(FabricApiError);
    expect(error).toMatchObject({ code: 'busy', message: 'Busy.', status: 409 });
  });

  it('joins validation messages and leaves the message empty without a body, for the UI to translate', async () => {
    fetchMock.mockReturnValueOnce(respond('{"message":["a","b"]}', 400));
    await expect(backUpNow()).rejects.toMatchObject({ code: null, message: 'a, b', status: 400 });
    fetchMock.mockReturnValueOnce(respond('{}', 500));
    await expect(backUpNow()).rejects.toMatchObject({ code: null, message: '', status: 500 });
    fetchMock.mockReturnValueOnce(respond('<html>', 502));
    await expect(backUpNow()).rejects.toMatchObject({ code: null, message: '', status: 502 });
  });

  it('downloads a stored backup under the name the server gives, or a fallback name', async () => {
    // jsdom has no object URLs; this file runs in its own environment.
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    fetchMock.mockReturnValueOnce(
      Promise.resolve(new Response('x', { headers: { 'Content-Disposition': 'attachment; filename="b.bin"' } })),
    );
    await downloadBackup('b1');
    fetchMock.mockReturnValueOnce(respond('x'));
    await downloadBackup('b2');
    expect(click).toHaveBeenCalledTimes(2);
    expect(click.mock.contexts.map((link) => (link as HTMLAnchorElement).download)).toEqual([
      'b.bin',
      'attraccess-matter-b2.attraccess-matter-backup',
    ]);
    fetchMock.mockReturnValueOnce(respond('{"code":"not_found","message":"Gone."}', 404));
    await expect(downloadBackup('b3')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('reads a file as base64 without the data-URL prefix', async () => {
    await expect(readFileAsBase64(new Blob(['ABC']))).resolves.toBe('QUJD');
  });
});
