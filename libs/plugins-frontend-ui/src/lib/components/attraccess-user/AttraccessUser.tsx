// User avatar and name display component for Attraccess users
// FEATURE: User identity display using HeroUI v3 Avatar compound
import { User } from '@attraccess/react-query-client';
import { useTranslations } from '../../i18n';
import { Avatar, AvatarFallback, AvatarImage, Button, Popover } from '@heroui/react';
import { toSvg } from 'jdenticon';
import { useMemo, ReactNode } from 'react';
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

  const startDirectMessage = onStartDirectMessage ?? actions.onStartDirectMessage;
  const isInteractive = !!user && !!startDirectMessage;

  if (variant === 'mini') {
    return (
      <Avatar size="sm" className={className} aria-label={name} title={name}>
        {avatarIcon ? <AvatarImage src={avatarIcon} alt={name} /> : null}
        <AvatarFallback color={isDeleted ? 'warning' : undefined}>
          {isDeleted ? <AlertTriangleIcon className="w-4 h-4" /> : name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
    );
  }

  const body = (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <Avatar>
        {avatarIcon ? <AvatarImage src={avatarIcon} alt={name} /> : null}
        <AvatarFallback color={isDeleted ? 'warning' : undefined}>
          {isDeleted ? <AlertTriangleIcon className="w-4 h-4" /> : name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col">
        <span className="text-sm font-medium">{isDeleted ? <del>{name}</del> : name}</span>
        {description && (
          <span className="text-xs text-muted-foreground">{isDeleted ? <del>{description}</del> : description}</span>
        )}
      </div>
    </div>
  );

  if (!isInteractive) {
    return body;
  }

  return (
    <Popover>
      <Popover.Trigger className="inline-flex w-fit cursor-pointer rounded-md outline-none focus-visible:ring-2">
        {body}
      </Popover.Trigger>
      <Popover.Content>
        <Popover.Dialog className="flex w-64 flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              {avatarIcon ? <AvatarImage src={avatarIcon} alt={name} /> : null}
              <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{name}</span>
              <span className="text-xs text-muted-foreground">#{user.id}</span>
            </div>
          </div>
          <span
            className={`w-fit rounded-full px-2 py-0.5 text-xs ${
              user.isEmailVerified
                ? 'bg-success-100 text-success-700'
                : 'bg-default-100 text-default-600'
            }`}
          >
            {user.isEmailVerified ? t('emailVerified') : t('emailUnverified')}
          </span>
          {!isDeleted && (
            <Button variant="primary" size="sm" className="w-full" onPress={() => startDirectMessage(user)}>
              <MessageCircleIcon className="h-4 w-4" />
              {t('startDirectMessage')}
            </Button>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
