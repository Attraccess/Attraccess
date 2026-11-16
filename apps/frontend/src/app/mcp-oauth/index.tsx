import { useMemo, useState } from 'react';
import { Alert, AlertContent, AlertDescription, AlertTitle, Card, Skeleton } from '@heroui/react';
import { Button, StatusDialog, useTranslations, useUrlQuery } from '@attraccess/plugins-frontend-ui';
import {
  useMcpOauthServiceApproveMcpOauthRequest,
  useMcpOauthServiceDenyMcpOauthRequest,
  useMcpOauthServiceGetMcpOauthRequest,
  useRbacServiceListPermissions,
} from '@attraccess/react-query-client';
import { UnauthorizedLayout } from '../unauthorized/unauthorized-layout/layout';
import { useRbacCatalogTranslations } from '../../hooks/useRbacCatalogTranslations';
import en from './en.json';
import de from './de.json';

type ApiFailure = { status?: number };
type Decision = 'approve' | 'deny';

/**
 * The consent step of the MCP OAuth flow. The API sends the browser here with an opaque `request` id; the route
 * needs a signed-in user, so signed-out users reach the login first and land back on this page afterwards.
 */
export function McpOAuthAuthorizePage() {
  const { t } = useTranslations({ en, de });
  const query = useUrlQuery();
  const requestId = query.get('request');
  const { permissionLabel, permissionDescription, permissionCategory } = useRbacCatalogTranslations();
  const [decided, setDecided] = useState<Decision | null>(null);
  const [failure, setFailure] = useState<'expired' | 'generic' | 'disabled' | null>(null);

  const consent = useMcpOauthServiceGetMcpOauthRequest({ requestId: requestId ?? '' }, undefined, {
    enabled: Boolean(requestId),
    retry: false,
  });
  const { data: catalog } = useRbacServiceListPermissions();

  const classify = (error: unknown): 'expired' | 'generic' | 'disabled' => {
    const status = (error as ApiFailure | undefined)?.status;
    if (status === 404) return 'expired';
    return 'generic';
  };

  const leave = { onSuccess: ({ redirectUrl }: { redirectUrl: string }) => window.location.assign(redirectUrl) };
  const approve = useMcpOauthServiceApproveMcpOauthRequest({
    ...leave,
    onError: (error) => {
      setDecided(null);
      setFailure(classify(error));
    },
  });
  const deny = useMcpOauthServiceDenyMcpOauthRequest({
    ...leave,
    onError: (error) => {
      setDecided(null);
      setFailure(classify(error));
    },
  });

  const groups = useMemo(() => {
    const byKey = new Map((catalog ?? []).map((permission) => [permission.key, permission]));
    const grouped = new Map<string, Array<{ key: string; label: string; description: string }>>();
    for (const key of consent.data?.permissions ?? []) {
      const permission = byKey.get(key) ?? { key, label: key, description: '', category: 'other' };
      const category = permissionCategory(permission.category ?? 'other');
      grouped.set(category, [
        ...(grouped.get(category) ?? []),
        { key, label: permissionLabel(permission), description: permissionDescription(permission) },
      ]);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog, consent.data?.permissions, permissionCategory, permissionLabel, permissionDescription]);

  const decide = (decision: Decision) => {
    if (!requestId || decided) return;
    setDecided(decision);
    (decision === 'approve' ? approve : deny).mutate({ requestId });
  };

  const loadFailure = consent.isError ? classify(consent.error) : null;
  const problem = !requestId ? 'missing' : (failure ?? loadFailure);

  if (problem) {
    const message = t(`error.${problem === 'missing' ? 'missing' : problem}`);
    return (
      <UnauthorizedLayout>
        <StatusDialog
          isOpen
          status="error"
          title={t('error.title')}
          closeLabel={t('error.close')}
          onClose={() => window.close()}
          data-cy="mcp-oauth-error-dialog"
        >
          {message}
        </StatusDialog>
      </UnauthorizedLayout>
    );
  }

  const view = consent.data;
  return (
    <UnauthorizedLayout>
      <Card className="w-full" data-cy="mcp-oauth-consent">
        <Card.Header>
          <Card.Title>
            {view ? t('title', { client: view.clientName }) : <Skeleton className="h-6 w-64 rounded-md" />}
          </Card.Title>
          <Card.Description>{t('intro')}</Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          {!view ? (
            <Skeleton className="h-32 w-full rounded-md" />
          ) : (
            <>
              <Alert status={view.loopbackRedirect ? 'warning' : 'default'} data-cy="mcp-oauth-redirect-notice">
                <AlertContent>
                  <AlertTitle>{view.loopbackRedirect ? t('loopback.title') : t('external.title')}</AlertTitle>
                  <AlertDescription>
                    {t(view.loopbackRedirect ? 'loopback.message' : 'external.message', { host: view.redirectHost })}
                  </AlertDescription>
                </AlertContent>
              </Alert>

              {view.unavailablePermissions.length > 0 && (
                <Alert status="danger" data-cy="mcp-oauth-unavailable">
                  <AlertContent>
                    <AlertTitle>{t('unavailable.title')}</AlertTitle>
                    <AlertDescription>
                      {t('unavailable.message', { permissions: view.unavailablePermissions.join(', ') })}
                    </AlertDescription>
                  </AlertContent>
                </Alert>
              )}

              <section aria-labelledby="mcp-oauth-permissions" className="flex flex-col gap-3">
                <h2 id="mcp-oauth-permissions" className="text-base font-semibold">
                  {t('permissions.title')}
                </h2>
                {view.requestedAll && (
                  <p className="text-sm text-muted">{t('permissions.all', { count: view.permissions.length })}</p>
                )}
                {groups.length === 0 && <p className="text-sm text-muted">{t('permissions.none')}</p>}
                {groups.map(([category, items]) => (
                  <div key={category} data-cy="mcp-oauth-permission-group">
                    <h3 className="text-sm font-medium">{category}</h3>
                    <ul className="mt-1 list-disc pl-5 text-sm">
                      {items.map((item) => (
                        <li key={item.key}>
                          <span className="font-medium">{item.label}</span>
                          {item.description ? <span className="text-muted"> – {item.description}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>

              <p className="text-sm text-muted">{t('notice')}</p>
            </>
          )}
        </Card.Content>
        <Card.Footer className="flex justify-end gap-2">
          {decided ? (
            <p role="status" className="text-sm text-muted" data-cy="mcp-oauth-returning">
              {t('returning')}
            </p>
          ) : (
            <>
              <Button variant="secondary" isDisabled={!view} onPress={() => decide('deny')} data-cy="mcp-oauth-deny">
                {t('deny')}
              </Button>
              <Button isDisabled={!view} onPress={() => decide('approve')} data-cy="mcp-oauth-approve">
                {t('approve')}
              </Button>
            </>
          )}
        </Card.Footer>
      </Card>
    </UnauthorizedLayout>
  );
}

export default McpOAuthAuthorizePage;
