import type { TFunction } from '@attraccess/plugins-frontend-ui';

/** Explains an install failure: the server's reason (when given) followed by the likeliest next step. */
export function describeInstallFailure(error: unknown, t: TFunction): string {
  const response = error && typeof error === 'object' ? (error as { status?: number; body?: unknown }) : null;
  const body = response?.body && typeof response.body === 'object' ? (response.body as { message?: unknown }) : null;
  const reason =
    typeof body?.message === 'string'
      ? body.message
      : Array.isArray(body?.message) && body.message.every((item) => typeof item === 'string')
        ? body.message.join('; ')
        : null;
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
