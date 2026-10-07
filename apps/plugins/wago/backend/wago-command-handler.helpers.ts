export function isAcknowledgementFailure(error: unknown): error is { acknowledgementError: Error } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'acknowledgementError' in error &&
    (error as { acknowledgementError: unknown }).acknowledgementError instanceof Error
  );
}
export function positiveInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : undefined;
}
