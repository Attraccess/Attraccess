// User avatar and name display component for Attraccess users
// FEATURE: User identity display using HeroUI v3 Avatar compound
import { User } from '@attraccess/react-query-client';
import { useTranslations } from '../../i18n';
import { Avatar, AvatarFallback, AvatarImage } from '@heroui/react';
import { toSvg } from 'jdenticon';
import { useMemo, ReactNode } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import en from './en.json';
import de from './de.json';

interface AttraccessUserProps {
  user?: User;
  description?: ReactNode;
  className?: string;
}

export function AttraccessUser({ user, description, className }: Readonly<AttraccessUserProps>) {
  const { t } = useTranslations({ en, de });

  const isDeleted = !user || !!user?.deletedAt;

  const avatarIcon = useMemo(() => {
    if (isDeleted) return undefined;
    const svg = toSvg(user?.id || 'unknown', 100);
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }, [isDeleted, user]);

  const name = user?.username || t('unknown');

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <Avatar>
        {avatarIcon ? <AvatarImage src={avatarIcon} /> : null}
        <AvatarFallback color={isDeleted ? 'warning' : undefined}>
          {isDeleted ? <AlertTriangleIcon className="w-4 h-4" /> : name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col">
        <span className="text-sm font-medium">{isDeleted ? <del>{name}</del> : name}</span>
        {description && <span className="text-xs text-muted-foreground">{isDeleted ? <del>{description}</del> : description}</span>}
      </div>
    </div>
  );
}
