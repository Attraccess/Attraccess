// User avatar and name display component for Attraccess users
// FEATURE: User identity display using HeroUI v3 Avatar compound
import { User } from '@attraccess/react-query-client';
import { formatUserDisplayName, hasUserName } from '@attraccess/shared';
import { useTranslations } from '../../i18n';
import { Avatar, AvatarFallback, AvatarImage, Button, Popover } from '@heroui/react';
import { toSvg } from 'jdenticon';
import { useMemo, ReactNode, useCallback } from 'react';
import { AlertTriangleIcon, ChevronDownIcon, MessageCircleIcon } from 'lucide-react';
import { useAttraccessUserActions } from './AttraccessUserActionsContext';
import { getUserInitials } from './getUserInitials';
import en from './en.json';
import de from './de.json';

/** A user to show. The names are optional so plugins that only know the id and username keep working. */
export type UserIdentity = Pick<User, 'id' | 'username'> & Partial<Pick<User, 'firstName' | 'lastName'>>;

interface AttraccessUserProps {
  user?: UserIdentity & Partial<Pick<User, 'deletedAt'>>;
  description?: ReactNode;
  className?: string;
  onStartDirectMessage?: (user: UserIdentity) => void;
  variant?: 'full' | 'mini';
  /** When false, render as plain display without the direct-message popover. Defaults to true. */
  interactive?: boolean;
}

export function AttraccessUser({
  user,
  description,
  className,
  onStartDirectMessage,
  variant = 'full',
  interactive = true,
}: Readonly<AttraccessUserProps>) {
  const { t } = useTranslations({ en, de });
  const actions = useAttraccessUserActions();

  const isDeleted = !user || !!user?.deletedAt;

  const avatarIcon = useMemo(() => {
    if (isDeleted) return undefined;
    const svg = toSvg(user?.id || 'unknown', 100);
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }, [isDeleted, user]);

  const name = user ? formatUserDisplayName(user) || t('unknown') : t('unknown');
  // The username is shown below the name only when it adds something: a name is set and differs from it.
  const secondaryUsername = user && hasUserName(user) && user.username !== name ? user.username : undefined;

  const startDirectMessage = useCallback(() => {
    if (onStartDirectMessage) {
      onStartDirectMessage(user);
    } else {
      actions.onStartDirectMessage(user);
    }
  }, [user, onStartDirectMessage, actions]);
  const isInteractive = interactive && !!user && !!startDirectMessage;

  const avatar = (
    <Avatar className="shrink-0">
      {avatarIcon ? <AvatarImage src={avatarIcon} alt={name} /> : null}
      <AvatarFallback color={isDeleted ? 'warning' : undefined}>
        {isDeleted ? <AlertTriangleIcon className="w-4 h-4" /> : user ? getUserInitials(user) : ''}
      </AvatarFallback>
    </Avatar>
  );

  const userInfoAndAvatar = (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      {avatar}
      <div className="flex min-w-0 flex-col">
        <div className="flex flex-row items-center gap-1">
          {/* A long name wraps, also inside a word, instead of pushing its table or list wider than the screen. */}
          <span className="text-sm font-medium [overflow-wrap:anywhere] group-hover:underline">{isDeleted ? <del>{name}</del> : name}</span>
          {isInteractive && (
            <ChevronDownIcon className="h-3 w-3 text-muted shrink-0" aria-hidden="true" focusable="false" />
          )}
        </div>
        {secondaryUsername && (
          <span className="text-xs text-muted [overflow-wrap:anywhere]">
            {isDeleted ? <del>{secondaryUsername}</del> : secondaryUsername}
          </span>
        )}
        {description && (
          <span className="text-xs text-muted">{isDeleted ? <del>{description}</del> : description}</span>
        )}
      </div>
    </div>
  );

  const finalComponent = variant === 'mini' ? avatar : userInfoAndAvatar;

  if (!isInteractive) {
    return finalComponent;
  }

  return (
    <Popover>
      <Popover.Trigger className="group inline-flex w-fit cursor-pointer rounded-md outline-none focus-visible:ring-2">
        {finalComponent}
      </Popover.Trigger>
      <Popover.Content>
        <Popover.Dialog aria-label={name} className="flex w-64 flex-col gap-3 p-4">
          {userInfoAndAvatar}
          {!isDeleted && (
            <Button variant="primary" size="sm" className="w-full" onPress={startDirectMessage}>
              <MessageCircleIcon className="h-4 w-4" />
              {t('startDirectMessage')}
            </Button>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
