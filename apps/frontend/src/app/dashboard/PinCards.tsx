import { ReactNode } from 'react';
import { Button, Card, Chip, Link, Spinner } from '@heroui/react';
import { ArrowRightIcon, CircleSlashIcon, StarOffIcon, Trash2Icon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
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
import { SortablePinCard } from './SortablePinCard';
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
            <Chip size="sm" color="accent">
              {page.badgeCount}
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
          >
            <Chip size="sm" color="warning">
              {t('card.unavailable')}
            </Chip>
          </CardHeading>
          <Card.Content>
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
  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });
  const { data: activeSession } = useResourcesServiceResourceUsageGetActiveSession({ resourceId });
  const title = resource?.name ?? pin.resourceName ?? pin.itemId;
  // The user's own session shows its timer inside the session controls already.
  const otherSession =
    activeSession?.usage && activeSession.usage.userId !== user?.id ? activeSession.usage : undefined;

  return (
    <SortablePinCard id={id} dragLabel={t('card.dragHandle', { title })}>
      {(dragHandle) => (
        <>
          <CardHeading dragHandle={dragHandle} title={<Card.Title className="truncate">{title}</Card.Title>}>
            <StatusChip resourceId={resourceId} />
            <UnpinButton label={t('card.unpin', { title })} onUnpin={onUnpin} />
          </CardHeading>
          <Card.Content className="flex flex-col gap-4">
            {otherSession && <SessionTimer startTime={otherSession.startTime} />}
            {resource ? <ResourceUsageSession resourceId={resourceId} resource={resource} /> : <Spinner size="sm" />}
          </Card.Content>
          <Card.Footer className="justify-end">
            <Link
              href={`/resources/${resourceId}`}
              aria-label={t('card.openResource', { title })}
              data-cy="dashboard-resource-card-open"
            >
              {t('card.open')}
              <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </Card.Footer>
        </>
      )}
    </SortablePinCard>
  );
}
