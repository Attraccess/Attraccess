import { InputGroup, Label, Link, TextField } from '@heroui/react';
import { Copy, ExternalLink } from 'lucide-react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useMcpServiceGetMcpConnectionInfo } from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

export interface McpConnectionInfo {
  url: string;
  oauthEnabled: boolean;
}

/**
 * The MCP endpoint of this deployment and whether OAuth sign-in works on it. Nothing to show, and so `undefined`, while
 * loading, when the request fails, or when the user could use neither OAuth nor an API token.
 */
export function useMcpConnection(canUseApiTokens: boolean): McpConnectionInfo | undefined {
  const { data } = useMcpServiceGetMcpConnectionInfo<McpConnectionInfo>(undefined, {
    retry: false,
    staleTime: Infinity,
  });
  return data && (data.oauthEnabled || canUseApiTokens) ? data : undefined;
}

interface McpConnectionCardProps {
  connection: McpConnectionInfo;
  /** The user may create API tokens; otherwise the card does not offer that way to sign in. */
  canUseApiTokens: boolean;
}

/** Tells users that Attraccess is an MCP server and how to add it to an AI client. */
export function McpConnectionCard({ connection, canUseApiTokens }: McpConnectionCardProps) {
  const { t } = useTranslations({ en, de });
  const { showToast } = useToastMessage();

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(connection.url);
      showToast({ title: t('copied'), type: 'success' });
    } catch {
      showToast({ title: t('copyFailed'), type: 'error' });
    }
  };

  return (
    <div className="flex max-w-xl flex-col gap-4" data-cy="mcp-connection-card">
      <p className="text-sm text-muted">{t('intro')}</p>

      <TextField value={connection.url} isReadOnly>
        <Label>{t('urlLabel')}</Label>
        <InputGroup>
          <InputGroup.Input data-cy="mcp-connection-url" />
          <InputGroup.Suffix>
            <Button variant="ghost" isIconOnly aria-label={t('copy')} onPress={copyUrl} data-cy="mcp-connection-copy">
              <Copy size={16} />
            </Button>
          </InputGroup.Suffix>
        </InputGroup>
      </TextField>

      <section aria-labelledby="mcp-connection-sign-in" className="flex flex-col gap-2">
        <h4 id="mcp-connection-sign-in" className="text-sm font-medium">
          {t('signIn.title')}
        </h4>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted">
          {connection.oauthEnabled && <li data-cy="mcp-connection-oauth">{t('signIn.oauth')}</li>}
          {canUseApiTokens && <li data-cy="mcp-connection-api-token">{t('signIn.apiToken')}</li>}
        </ul>
        {!connection.oauthEnabled && (
          <p className="text-sm text-muted" data-cy="mcp-connection-oauth-unavailable">
            {t('signIn.oauthUnavailable')}
          </p>
        )}
      </section>

      <Link href={t('docsUrl')} target="_blank" rel="noreferrer" className="text-sm" data-cy="mcp-connection-docs">
        {t('docs')}
        <ExternalLink size={14} aria-hidden />
      </Link>
    </div>
  );
}
