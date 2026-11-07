/** Hands an in-memory file to the browser's download flow. */
export function saveTextFile(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/x-pem-file' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const MIN_PASSPHRASE_LENGTH = 12;
