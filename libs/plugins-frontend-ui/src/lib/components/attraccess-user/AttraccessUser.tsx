// User avatar and name display component for Attraccess users
// FEATURE: User identity display using HeroUI v3 Avatar compound
import { User } from '@attraccess/react-query-client';
import { useTranslations } from '../../i18n';
import { Avatar, AvatarFallback, AvatarImage, Button, Popover } from '@heroui/react';
import { toSvg } from 'jdenticon';
import { useMemo, ReactNode, useCallback } from 'react';
import { AlertTriangleIcon, MessageCircleIcon } from 'lucide-react';
import { useAttraccessUserActions } from './AttraccessUserActionsContext';
import en from './en.json';
import de from './de.json';

interface AttraccessUserProps {
  user?: User;
  description?: ReactNode;
  className?: string;
  onStartDirectMessage?: (user: User) => void;
  variant?: 'full' | 'mini';
}

export function AttraccessUser({
  user,
  description,
  className,
  onStartDirectMessage,
  variant = 'full',
}: Readonly<AttraccessUserProps>) {
  const { t } = useTranslations({ en, de });
  const actions = useAttraccessUserActions();

  const isDeleted = !user || !!user?.deletedAt;

  const avatarIcon = useMemo(() => {
    if (isDeleted) return undefined;
    const svg = toSvg(user?.id || 'unknown', 100);
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }, [isDeleted, user]);

  const name = user?.username || t('unknown');

  const startDirectMessage = useCallback(() => {
    if (onStartDirectMessage) {
      onStartDirectMessage(user);
    } else {
      actions.onStartDirectMessage(user);
    }
  }, [user, onStartDirectMessage, actions]);
  const isInteractive = !!user && !!startDirectMessage;

  const avatar = (
    <Avatar>
      {avatarIcon ? <AvatarImage src={avatarIcon} alt={name} /> : null}
      <AvatarFallback color={isDeleted ? 'warning' : undefined}>
        {isDeleted ? <AlertTriangleIcon className="w-4 h-4" /> : name.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );

  const userInfoAndAvatar = (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      {avatar}
      <div className="flex flex-col">
        <div className="flex flex-row items-center">
          <span className="text-sm font-medium">{isDeleted ? <del>{name}</del> : name}</span>
          <Button isIconOnly variant="ghost" size="sm" onPress={startDirectMessage}>
            <MessageCircleIcon />
          </Button>
        </div>
        {description && (
          <span className="text-xs text-muted-foreground">{isDeleted ? <del>{description}</del> : description}</span>
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
      <Popover.Trigger className="inline-flex w-fit cursor-pointer rounded-md outline-none focus-visible:ring-2">
        {finalComponent}
      </Popover.Trigger>
      <Popover.Content>
        <Popover.Dialog className="flex w-64 flex-col gap-3 p-4">
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
