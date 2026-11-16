import { ReactNode } from 'react';
import { Button, Card, Chip, Link, Spinner } from '@heroui/react';
import { ArrowRightIcon, CircleSlashIcon, Trash2Icon } from 'lucide-react';
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
import { PinEditControls, SortablePinCard, SortablePinSection } from './SortablePinCard';
import de from './de.json';
import en from './en.json';

export interface PinCardProps {
  id: string;
  isEditing: boolean;
  onRemove: () => void;
}

export function CardHeading({
  controls,
  title,
  children,
}: Readonly<{ controls: PinEditControls; title: ReactNode; children?: ReactNode }>) {
  return (
    <Card.Header className="flex flex-row items-center gap-3">
      {controls.dragHandle}
      <div className="flex min-w-0 flex-1 items-center gap-3">{title}</div>
      {children}
      {controls.removeButton}
    </Card.Header>
  );
}

export function PagePinCard({ id, page, isEditing, onRemove }: Readonly<PinCardProps & { page: PinnablePage }>) {
  return (
    <SortablePinCard id={id} title={page.title} isEditing={isEditing} onRemove={onRemove}>
      {(controls) => (
        <CardHeading
          controls={controls}
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
        </CardHeading>
      )}
    </SortablePinCard>
  );
}

/**
 * A page or widget pin the user cannot use now. It stays stored, so restoring access brings the card back. Its Remove
 * button is its content, not an edit control, so it shows outside edit mode too.
 */
export function UnavailablePinCard({
  id,
  title,
  description,
  isEditing,
  onRemove,
}: Readonly<PinCardProps & { title: string; description: string }>) {
  const { t } = useTranslations({ en, de });

  return (
    <SortablePinCard id={id} title={title} isEditing={isEditing}>
      {(controls) => (
        <>
          <CardHeading
            controls={controls}
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
            <Card.Description>{description}</Card.Description>
          </Card.Content>
          <Card.Footer>
            <Button
              size="sm"
              variant="secondary"
              onPress={onRemove}
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

/** A page or widget pin that is not known yet because the license or the plugins are still loading. */
export function PendingPinCard({ id, title, isEditing, onRemove }: Readonly<PinCardProps & { title: string }>) {
  return (
    <SortablePinCard id={id} title={title} isEditing={isEditing} onRemove={onRemove}>
      {(controls) => (
        <CardHeading controls={controls} title={<Card.Title className="truncate text-muted">{title}</Card.Title>}>
          <Spinner size="sm" />
        </CardHeading>
      )}
    </SortablePinCard>
  );
}

/** A resource with its status, a live timer and the same session controls as its detail page. */
export function ResourcePinCard({ id, pin, isEditing, onRemove }: Readonly<PinCardProps & { pin: DashboardPin }>) {
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
    <SortablePinSection id={id} title={title} isEditing={isEditing} onRemove={onRemove}>
      {(controls) => (
        <>
          <header className="flex flex-row items-center gap-3">
            {controls.dragHandle}
            <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h3>
            <StatusChip resourceId={resourceId} />
            {controls.removeButton}
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
