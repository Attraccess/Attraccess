import type { TFunction } from '@attraccess/plugins-frontend-ui';

/** The server's reason for a failed plugin request (the `message` of the API error body), or null without one. */
export function installFailureReason(error: unknown): string | null {
  const response = error && typeof error === 'object' ? (error as { body?: unknown }) : null;
  const body = response?.body && typeof response.body === 'object' ? (response.body as { message?: unknown }) : null;
  if (typeof body?.message === 'string') return body.message;
  if (Array.isArray(body?.message) && body.message.every((item) => typeof item === 'string')) {
    return body.message.join('; ');
  }
  return null;
}

/** Explains an install failure: the server's reason (when given) followed by the likeliest next step. */
export function describeInstallFailure(error: unknown, t: TFunction): string {
  const response = error && typeof error === 'object' ? (error as { status?: number }) : null;
  const reason = installFailureReason(error);
  const nextStep =
    response?.status === 401 || response?.status === 403
      ? t('marketplace.installPermissionHelp')
      : reason?.startsWith('Cannot POST')
        ? t('marketplace.installRouteHelp')
        : reason?.includes('not compatible') || reason?.includes('compatible peer dependency')
          ? t('marketplace.installCompatibilityHelp')
          : response?.status === 404
            ? t('marketplace.installVersionHelp')
            : response?.status === 500
              ? t('marketplace.installServerHelp')
              : t('marketplace.installRetryHelp');
  return [reason, nextStep].filter(Boolean).join(' ');
}
