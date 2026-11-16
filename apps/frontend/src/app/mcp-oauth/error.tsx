import { StatusDialog, useTranslations, useUrlQuery } from '@attraccess/plugins-frontend-ui';
import { UnauthorizedLayout } from '../unauthorized/unauthorized-layout/layout';
import { leaveThePage } from './index';
import en from './en.json';
import de from './de.json';

/** Error codes the API sends here. Anything else in the URL is ignored, so the page never shows injected text. */
const KNOWN_ERRORS = new Set([
  'invalid_client',
  'invalid_redirect_uri',
  'invalid_request',
  'invalid_scope',
  'invalid_target',
  'unsupported_response_type',
]);

/**
 * Where the authorization endpoint sends the browser when it must not redirect to the client: the client or its
 * redirect URI is unknown, or a self-registered client sent an invalid request. Needs no sign-in.
 */
export function McpOAuthErrorPage() {
  const { t } = useTranslations({ en, de });
  const raw = useUrlQuery().get('error') ?? '';
  const code = KNOWN_ERRORS.has(raw) ? raw : 'invalid_request';
  const message =
    code === 'invalid_client' || code === 'invalid_redirect_uri'
      ? t(`authorizeError.${code}`)
      : t('authorizeError.request', { code });
  return (
    <UnauthorizedLayout>
      <StatusDialog
        isOpen
        status="error"
        title={t('authorizeError.title')}
        closeLabel={t('error.close')}
        onClose={leaveThePage}
        data-cy="mcp-oauth-authorize-error"
      >
        {message}
      </StatusDialog>
    </UnauthorizedLayout>
  );
}
