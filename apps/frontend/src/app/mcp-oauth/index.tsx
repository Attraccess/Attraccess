import { useMemo, useState } from 'react';
import { Alert, AlertContent, AlertDescription, AlertTitle, Card, Skeleton } from '@heroui/react';
import { Button, StatusDialog, useTranslations, useUrlQuery } from '@attraccess/plugins-frontend-ui';
import {
  useApproveMcpOAuthRequest,
  useDenyMcpOAuthRequest,
  useGetMcpOAuthRequest,
} from '@attraccess/react-query-client';
import { UnauthorizedLayout } from '../unauthorized/unauthorized-layout/layout';
import { PermissionChipGroups } from '../../components/permissionList';
import { useRbacCatalogTranslations } from '../../hooks/useRbacCatalogTranslations';
import en from './en.json';
import de from './de.json';

type ApiFailure = { status?: number; body?: { error?: unknown } };
type Decision = 'approve' | 'deny';
type Failure = 'expired' | 'generic' | 'disabled' | 'framed';

/** Browsers only let a script close a window that a script opened; otherwise the user lands on the app instead. */
export function leaveThePage() {
  window.close();
  window.location.assign('/');
}

function classify(error: unknown): Failure {
  const failure = error as ApiFailure | undefined;
  if (failure?.status === 404) return failure.body?.error === 'oauth_disabled' ? 'disabled' : 'expired';
  return 'generic';
}

/** A consent page inside a frame could be overlaid to trick the user into clicking Allow. */
function isFramed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

/**
 * The consent step of the MCP OAuth flow. The API sends the browser here with an opaque `request` id; the route
 * needs a signed-in user, so signed-out users reach the login first and land back on this page afterwards.
 */
export function McpOAuthAuthorizePage() {
  const { t } = useTranslations({ en, de });
  const query = useUrlQuery();
  const requestId = query.get('request');
  const { permissionLabel } = useRbacCatalogTranslations();
  const [decided, setDecided] = useState<Decision | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(() => (isFramed() ? 'framed' : null));

  const consent = useGetMcpOAuthRequest({ path: { requestId: requestId ?? '' } }, undefined, {
    enabled: Boolean(requestId) && failure !== 'framed',
    retry: false,
  });

  const handlers = {
    onSuccess: ({ redirectUrl }: { redirectUrl: string }) => {
      setRedirecting(true);
      window.location.assign(redirectUrl);
    },
    onError: (error: unknown) => {
      setDecided(null);
      setFailure(classify(error));
    },
  };
  const approve = useApproveMcpOAuthRequest(undefined, handlers);
  const deny = useDenyMcpOAuthRequest(undefined, handlers);

  const view = consent.data;
  const unavailableLabels = useMemo(() => {
    const byKey = new Map((view?.permissions ?? []).map((permission) => [permission.key, permission]));
    return (view?.unavailablePermissions ?? []).map((key) => permissionLabel(byKey.get(key) ?? { key })).join(', ');
  }, [view, permissionLabel]);

  const decide = (decision: Decision) => {
    if (!requestId || decided) return;
    setDecided(decision);
    (decision === 'approve' ? approve : deny).mutate({ path: { requestId } });
  };

  const problem = !requestId ? 'missing' : (failure ?? (consent.isError ? classify(consent.error) : null));
  if (problem) {
    return (
      <UnauthorizedLayout>
        <StatusDialog
          isOpen
          status="error"
          title={t('error.title')}
          closeLabel={t('error.close')}
          onClose={leaveThePage}
          data-cy="mcp-oauth-error-dialog"
        >
          {t(`error.${problem}`)}
        </StatusDialog>
      </UnauthorizedLayout>
    );
  }

  // Every self-registered client and every redirect to this device deserves a second look; only an
  // operator-registered client returning to a public https address is shown as a plain notice.
  const warn = view ? view.loopbackRedirect || !view.registeredByOperator : false;
  return (
    <UnauthorizedLayout>
      <Card className="w-full" data-cy="mcp-oauth-consent">
        <Card.Header>
          <Card.Title className="break-words">
            {view ? t('title', { client: view.clientName }) : <Skeleton className="h-6 w-64 rounded-md" />}
          </Card.Title>
          <Card.Description>{t('intro')}</Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          {!view ? (
            <Skeleton className="h-32 w-full rounded-md" />
          ) : (
            <>
              <Alert status={warn ? 'warning' : 'default'} data-cy="mcp-oauth-redirect-notice">
                <AlertContent>
                  <AlertTitle>{view.loopbackRedirect ? t('loopback.title') : t('external.title')}</AlertTitle>
                  <AlertDescription>
                    {t(view.loopbackRedirect ? 'loopback.message' : 'external.message', { host: view.redirectHost })}
                    {view.registeredByOperator ? null : ` ${t('selfRegistered')}`}
                  </AlertDescription>
                </AlertContent>
              </Alert>

              {view.unavailablePermissions.length > 0 && (
                <Alert status="danger" data-cy="mcp-oauth-unavailable">
                  <AlertContent>
                    <AlertTitle>{t('unavailable.title')}</AlertTitle>
                    <AlertDescription>{t('unavailable.message', { permissions: unavailableLabels })}</AlertDescription>
                  </AlertContent>
                </Alert>
              )}

              <section aria-labelledby="mcp-oauth-permissions" className="flex flex-col gap-3">
                <h4 id="mcp-oauth-permissions" className="text-base font-semibold">
                  {t('permissions.title')}
                </h4>
                {view.requestedAll && (
                  <p className="text-sm text-muted">{t('permissions.all', { count: view.permissions.length })}</p>
                )}
                {view.permissions.length === 0 ? (
                  <p className="text-sm text-muted">{t('permissions.none')}</p>
                ) : (
                  <PermissionChipGroups permissions={view.permissions} uncategorizedLabel={t('permissions.other')} />
                )}
              </section>

              <p className="text-sm text-muted">{t('notice')}</p>
            </>
          )}
        </Card.Content>
        <Card.Footer className="flex flex-col items-end gap-2">
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              isDisabled={!view || (decided !== null && decided !== 'deny') || redirecting}
              isPending={decided === 'deny'}
              onPress={() => decide('deny')}
              data-cy="mcp-oauth-deny"
            >
              {t('deny')}
            </Button>
            <Button
              isDisabled={!view || (decided !== null && decided !== 'approve') || redirecting}
              isPending={decided === 'approve'}
              onPress={() => decide('approve')}
              data-cy="mcp-oauth-approve"
            >
              {t('approve')}
            </Button>
          </div>
          <p role="status" aria-live="polite" className="text-sm text-muted" data-cy="mcp-oauth-returning">
            {redirecting ? t(decided === 'deny' ? 'returningDenied' : 'returningApproved') : ''}
          </p>
        </Card.Footer>
      </Card>
    </UnauthorizedLayout>
  );
}

export default McpOAuthAuthorizePage;
