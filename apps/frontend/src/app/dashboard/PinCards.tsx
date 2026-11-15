import { ReactNode } from 'react';
import { Button, Card, Chip, Link, Spinner } from '@heroui/react';
import { ArrowRightIcon, CircleSlashIcon, StarOffIcon, Trash2Icon } from 'lucide-react';
import { StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useResourcesServiceGetOneResourceById,
  useResourcesServiceResourceUsageGetActiveSession,
} from '@attraccess/react-query-client';
import { useAuth } from '../../hooks/useAuth';
import { StatusChip } from '../resourceOverview/resourceGroupCard/statusChip';
import { ResourceUsageSession } from '../resources/usage/components/ResourceUsageSession';
import { SessionTimer } from '../resources/usage/components/SessionTimer';
import { DashboardPin } from './pins';
import { PinnablePage } from './pinnablePagesContext';
import { SortablePinCard, SortablePinSection } from './SortablePinCard';
import de from './de.json';
import en from './en.json';

interface PinCardProps {
  id: string;
  onUnpin: () => void;
}

function CardHeading({
  dragHandle,
  title,
  children,
}: Readonly<{ dragHandle: ReactNode; title: ReactNode; children?: ReactNode }>) {
  return (
    <Card.Header className="flex flex-row items-center gap-3">
      {dragHandle}
      <div className="flex min-w-0 flex-1 items-center gap-3">{title}</div>
      {children}
    </Card.Header>
  );
}

function UnpinButton({ label, onUnpin }: Readonly<{ label: string; onUnpin: () => void }>) {
  return (
    <Button isIconOnly size="sm" variant="ghost" aria-label={label} onPress={onUnpin} data-cy="dashboard-card-unpin">
      <StarOffIcon className="w-4 h-4" />
    </Button>
  );
}

export function PagePinCard({ id, page, onUnpin }: Readonly<PinCardProps & { page: PinnablePage }>) {
  const { t } = useTranslations({ en, de });

  return (
    <SortablePinCard id={id} dragLabel={t('card.dragHandle', { title: page.title })}>
      {(dragHandle) => (
        <CardHeading
          dragHandle={dragHandle}
          title={
            <Link
              href={page.path}
              className="flex min-w-0 flex-1 items-center gap-3 no-underline"
              data-cy="dashboard-page-card-link"
            >
              {page.icon}
              <Card.Title className="truncate">{page.title}</Card.Title>
            </Link>
          }
        >
          {!!page.badgeCount && (
            // Same badge as the sidebar entry.
            <Chip size="sm" color="accent" variant="primary">
              {page.badgeCount > 99 ? '99+' : page.badgeCount}
            </Chip>
          )}
          <UnpinButton label={t('card.unpin', { title: page.title })} onUnpin={onUnpin} />
        </CardHeading>
      )}
    </SortablePinCard>
  );
}

/** A page pin the user cannot open now. It stays stored, so restoring access brings the card back. */
export function UnavailablePinCard({ id, title, onUnpin }: Readonly<PinCardProps & { title: string }>) {
  const { t } = useTranslations({ en, de });

  return (
    <SortablePinCard id={id} dragLabel={t('card.dragHandle', { title })}>
      {(dragHandle) => (
        <>
          <CardHeading
            dragHandle={dragHandle}
            title={
              <>
                <CircleSlashIcon className="w-5 h-5 shrink-0 text-muted" aria-hidden />
                <Card.Title className="truncate text-muted">{title}</Card.Title>
              </>
            }
          />
          <Card.Content className="flex flex-col items-start gap-2">
            <Chip size="sm" color="warning">
              {t('card.unavailable')}
            </Chip>
            <Card.Description>{t('card.unavailableDescription')}</Card.Description>
          </Card.Content>
          <Card.Footer>
            <Button
              size="sm"
              variant="secondary"
              onPress={onUnpin}
              aria-label={t('card.removeLabel', { title })}
              data-cy="dashboard-card-remove"
            >
              <Trash2Icon className="w-4 h-4" />
              {t('card.remove')}
            </Button>
          </Card.Footer>
        </>
      )}
    </SortablePinCard>
  );
}

/** A page pin whose page is not known yet because the plugins are still loading. */
export function PendingPinCard({ id, title }: Readonly<{ id: string; title: string }>) {
  const { t } = useTranslations({ en, de });

  return (
    <SortablePinCard id={id} dragLabel={t('card.dragHandle', { title })}>
      {(dragHandle) => (
        <CardHeading dragHandle={dragHandle} title={<Card.Title className="truncate text-muted">{title}</Card.Title>}>
          <Spinner size="sm" />
        </CardHeading>
      )}
    </SortablePinCard>
  );
}

/** A resource with its status, a live timer and the same session controls as its detail page. */
export function ResourcePinCard({ id, pin, onUnpin }: Readonly<PinCardProps & { pin: DashboardPin }>) {
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();
  const resourceId = Number(pin.itemId);
  const { data: resource, isError } = useResourcesServiceGetOneResourceById({ id: resourceId });
  const { data: activeSession } = useResourcesServiceResourceUsageGetActiveSession({ resourceId });
  const title = resource?.name ?? pin.resourceName ?? pin.itemId;
  // The user's own session shows its timer inside the session controls already, and parallel sessions list their
  // start times there; only a single session of someone else gets a timer here.
  const sessions = activeSession?.usages ?? (activeSession?.usage ? [activeSession.usage] : []);
  const otherSession = sessions.length === 1 && sessions[0].userId !== user?.id ? sessions[0] : undefined;

  const renderSession = () => {
    if (resource) return <ResourceUsageSession resourceId={resourceId} resource={resource} />;
    if (isError) return <StatusAlert status="danger" title={t('card.resourceLoadError')} />;
    return <Spinner size="sm" />;
  };

  return (
    <SortablePinSection id={id} dragLabel={t('card.dragHandle', { title })}>
      {(dragHandle) => (
        <>
          <header className="flex flex-row items-center gap-3">
            {dragHandle}
            <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h3>
            <StatusChip resourceId={resourceId} />
            <UnpinButton label={t('card.unpin', { title })} onUnpin={onUnpin} />
          </header>
          <div className="flex flex-col gap-4">
            {otherSession && <SessionTimer startTime={otherSession.startTime} />}
            {renderSession()}
          </div>
          <footer className="flex justify-end">
            <Link
              href={`/resources/${resourceId}`}
              aria-label={t('card.openResource', { title })}
              data-cy="dashboard-resource-card-open"
            >
              {t('card.open')}
              <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </footer>
        </>
      )}
    </SortablePinSection>
  );
}
