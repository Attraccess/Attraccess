import { ReactNode } from 'react';
import { Button, Chip, cn, Link, Spinner } from '@heroui/react';
import { CircleSlashIcon, Trash2Icon } from 'lucide-react';
import { StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useGetOneResourceById, useResourceUsageGetActiveSession } from '@attraccess/react-query-client';
import { useAuth } from '../../hooks/useAuth';
import { StatusChip } from '../resourceOverview/resourceGroupCard/statusChip';
import { ResourceUsageSession } from '../resources/usage/components/ResourceUsageSession';
import { SessionTimer } from '../resources/usage/components/SessionTimer';
import { DashboardPin } from './pins';
import { PinnablePage } from './pinnablePagesContext';
import { PinEditControls, PinTile } from './SortablePinCard';
import { RESOURCE_TILE_SIZES, TileSize } from './sizes';
import de from './de.json';
import en from './en.json';
import { sessionStartOf } from '../resources/usage/sessionDuration';

export interface PinCardProps {
  id: string;
  size: TileSize;
  isEditing: boolean;
  isPreview?: boolean;
  onRemove: () => void;
  onResize?: (size: TileSize) => void;
}

/**
 * A tile's header row: the drag handle, the title, extra content, the size control and the remove button. `stacked`
 * gives the edit controls a row of their own above the title, so a small tile keeps room for its title while editing.
 */
export function CardHeading({
  controls,
  title,
  stacked = false,
  children,
}: Readonly<{ controls: PinEditControls; title: ReactNode; stacked?: boolean; children?: ReactNode }>) {
  const hasControls = !!(controls.dragHandle || controls.sizeControl || controls.removeButton);
  if (stacked && hasControls) {
    return (
      <>
        <div className="flex min-w-0 flex-row items-center gap-1">
          {controls.dragHandle}
          <span className="flex-1" />
          {controls.sizeControl}
          {controls.removeButton}
        </div>
        <header className="flex min-w-0 flex-row items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">{title}</div>
          {children}
        </header>
      </>
    );
  }
  return (
    <header className="flex min-w-0 flex-row items-center gap-2">
      {controls.dragHandle}
      <div className="flex min-w-0 flex-1 items-center gap-2">{title}</div>
      {children}
      {controls.sizeControl}
      {controls.removeButton}
    </header>
  );
}

/**
 * A tile's icon and title. Outside edit mode they link to the page the tile stands for; in edit mode they are plain
 * text, so pressing them cannot leave the dashboard mid-edit.
 */
export function TileTitle({
  icon,
  title,
  href,
  isEditing,
  'data-cy': dataCy,
}: Readonly<{ icon?: ReactNode; title: string; href?: string; isEditing: boolean; 'data-cy'?: string }>) {
  const content = (
    <>
      {icon && <span className="flex shrink-0 text-muted">{icon}</span>}
      <h3 className="min-w-0 truncate text-sm font-medium" data-cy={dataCy}>
        {title}
      </h3>
    </>
  );
  if (!href || isEditing) return content;
  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-2 text-foreground no-underline"
      data-cy="dashboard-card-header-link"
    >
      {content}
    </Link>
  );
}

function BadgeCount({ count }: Readonly<{ count?: number }>) {
  if (!count) return null;
  // Same badge as the sidebar entry.
  return (
    <Chip size="sm" color="accent" variant="primary">
      {count > 99 ? '99+' : count}
    </Chip>
  );
}

/** A small shortcut tile: the page's icon, title and sidebar counter. The whole tile opens the page. */
export function PagePinCard({
  id,
  page,
  size,
  isEditing,
  isPreview,
  onRemove,
}: Readonly<PinCardProps & { page: PinnablePage }>) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="text-accent">{page.icon}</span>
        <BadgeCount count={page.badgeCount} />
      </span>
      <span className="line-clamp-2 text-sm font-medium text-foreground">{page.title}</span>
    </>
  );

  return (
    <PinTile id={id} title={page.title} size={size} isEditing={isEditing} isPreview={isPreview} onRemove={onRemove}>
      {(controls) =>
        isEditing ? (
          <>
            <CardHeading controls={controls} title={null} />
            <div className="flex min-h-0 flex-1 flex-col justify-end gap-2">{body}</div>
          </>
        ) : (
          // items-stretch: HeroUI's link centres its content, which would pull the icon, badge and title to the middle.
          <Link
            href={page.path}
            className="flex h-full w-full min-h-0 flex-col items-stretch justify-between gap-2 no-underline"
            data-cy="dashboard-page-card-link"
          >
            {body}
          </Link>
        )
      }
    </PinTile>
  );
}

/**
 * A page or widget pin the user cannot use now. It stays stored, so restoring access brings the tile back. Its Remove
 * button is its content, not an edit control, so it shows outside edit mode too.
 */
export function UnavailablePinCard({
  id,
  title,
  description,
  size,
  isEditing,
  onRemove,
}: Readonly<PinCardProps & { title: string; description: string }>) {
  const { t } = useTranslations({ en, de });
  const isSmall = size === 'small';

  return (
    <PinTile id={id} title={title} size={size} isEditing={isEditing}>
      {(controls) => (
        <>
          <CardHeading
            controls={controls}
            stacked={isSmall}
            title={
              <>
                <CircleSlashIcon className="w-5 h-5 shrink-0 text-muted" aria-hidden />
                <h3 className="min-w-0 truncate text-sm font-medium text-muted">{title}</h3>
              </>
            }
          />
          <div className="flex min-h-0 flex-1 flex-col items-start gap-2 overflow-hidden">
            <Chip size="sm" color="warning">
              {t('card.unavailable')}
            </Chip>
            {!isSmall && <p className="line-clamp-2 text-sm text-muted">{description}</p>}
          </div>
          <div>
            <Button
              size="sm"
              variant="secondary"
              isIconOnly={isSmall}
              onPress={onRemove}
              aria-label={t('card.removeLabel', { title })}
              data-cy="dashboard-card-remove"
            >
              <Trash2Icon className="w-4 h-4" />
              {!isSmall && t('card.remove')}
            </Button>
          </div>
        </>
      )}
    </PinTile>
  );
}

/** A page or widget pin that is not known yet because the license or the plugins are still loading. */
export function PendingPinCard({ id, title, size, isEditing, onRemove }: Readonly<PinCardProps & { title: string }>) {
  return (
    <PinTile id={id} title={title} size={size} isEditing={isEditing} onRemove={onRemove}>
      {(controls) => (
        <CardHeading
          controls={controls}
          stacked={size === 'small'}
          title={<h3 className="min-w-0 truncate text-sm font-medium text-muted">{title}</h3>}
        >
          <Spinner size="sm" />
        </CardHeading>
      )}
    </PinTile>
  );
}

function useResourcePin(pin: DashboardPin) {
  const { user } = useAuth();
  const resourceId = Number(pin.itemId);
  const resourceQuery = useGetOneResourceById({ path: { id: resourceId } });
  const { data: activeSession } = useResourceUsageGetActiveSession({ path: { resourceId } });
  const sessions = activeSession?.usages ?? (activeSession?.usage ? [activeSession.usage] : []);
  return {
    resourceId,
    resourceQuery,
    title: resourceQuery.data?.name ?? pin.resourceName ?? pin.itemId,
    sessions,
    ownSession: sessions.find((session) => session.userId === user?.id),
    otherSession: sessions.length === 1 && sessions[0].userId !== user?.id ? sessions[0] : undefined,
  };
}

/** A small resource tile: its name, status and the user's own elapsed time. The tile opens the resource. */
function SmallResourceContent({
  pin,
  controls,
  isEditing,
}: Readonly<{ pin: DashboardPin; controls: PinEditControls; isEditing: boolean }>) {
  const { resourceId, title, ownSession } = useResourcePin(pin);
  const body = (
    <>
      <StatusChip resourceId={resourceId} />
      <span className="line-clamp-2 text-sm font-medium text-foreground">{title}</span>
      {ownSession && <SessionTimer startTime={sessionStartOf(ownSession)} variant="compact" />}
    </>
  );
  if (isEditing) {
    return (
      <>
        <CardHeading controls={controls} title={null} />
        <div className="flex min-h-0 flex-1 flex-col items-start justify-end gap-1">{body}</div>
      </>
    );
  }
  return (
    <Link
      href={`/resources/${resourceId}`}
      className="flex h-full w-full min-h-0 flex-col items-start justify-between gap-1 no-underline"
      data-cy="dashboard-resource-card-link"
    >
      {body}
    </Link>
  );
}

/** A large resource tile: status, a live timer and the same session controls as the resource's detail page. */
function LargeResourceContent({
  pin,
  controls,
  isEditing,
}: Readonly<{ pin: DashboardPin; controls: PinEditControls; isEditing: boolean }>) {
  const { t } = useTranslations({ en, de });
  const { resourceId, resourceQuery, title, otherSession } = useResourcePin(pin);

  const renderSession = () => {
    if (resourceQuery.data) return <ResourceUsageSession resourceId={resourceId} resource={resourceQuery.data} />;
    if (resourceQuery.isError) return <StatusAlert status="danger" title={t('card.resourceLoadError')} />;
    return <Spinner size="sm" />;
  };

  return (
    <>
      <CardHeading
        controls={controls}
        title={<TileTitle title={title} href={`/resources/${resourceId}`} isEditing={isEditing} />}
      >
        <StatusChip resourceId={resourceId} />
      </CardHeading>
      {/* Session controls vary with the resource (forms, supervisors), so they scroll inside the fixed tile. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {/* The user's own session shows its timer inside the session controls already. */}
        {otherSession && <SessionTimer startTime={sessionStartOf(otherSession)} />}
        {renderSession()}
      </div>
    </>
  );
}

/** A pinned resource: small with its status, or large with the session controls of its detail page. */
export function ResourcePinCard({
  id,
  pin,
  size,
  isEditing,
  onRemove,
  onResize,
}: Readonly<PinCardProps & { pin: DashboardPin }>) {
  const { title } = useResourcePin(pin);
  const Content = size === 'small' ? SmallResourceContent : LargeResourceContent;

  return (
    <PinTile
      id={id}
      title={title}
      size={size}
      sizes={RESOURCE_TILE_SIZES.sizes}
      isEditing={isEditing}
      surface="section"
      onRemove={onRemove}
      onResize={onResize}
    >
      {(controls) => (
        <div className={cn('flex h-full min-h-0 flex-col', size === 'small' ? 'gap-1' : 'gap-3')}>
          <Content pin={pin} controls={controls} isEditing={isEditing} />
        </div>
      )}
    </PinTile>
  );
}
