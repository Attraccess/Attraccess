/**
 * Triggers a browser download of `data` as `filename`, via a throwaway object URL and an
 * off-DOM anchor click.
 *
 * `URL.revokeObjectURL` is deferred to a macrotask rather than called synchronously after
 * `click()`: Firefox and older Safari can abort the download if the URL is revoked before the
 * click has actually been dispatched to the download handler.
 */
export function triggerDownload(data: BlobPart, filename: string, type = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
