import { ApiError } from '@attraccess/react-query-client';

/**
 * The wording for a failed switch request whose message has none of its own: whether the project is known to be
 * unchanged, and if a device is why.
 */
export function switchErrorFallbackKey(error: unknown) {
  const { status, body } = (error ?? {}) as Partial<ApiError>;
  // A switch flow's device refused or did not answer; the message is its transport error.
  if ((body as { error?: unknown } | undefined)?.error === 'External effect failed') {
    return 'PROJECT_SWITCH_DEVICE_FAILED';
  }
  // No answer from the API itself: the switch may have happened.
  if (status === undefined || status === 502 || status === 504) return 'PROJECT_SWITCH_UNCONFIRMED';
  return 'PROJECT_SWITCH_FAILED';
}
