import { User } from '@attraccess/react-query-client';
import { useTranslations } from '../../i18n';
import { User as UserComponent, UserProps } from '@heroui/react';
import { toSvg } from 'jdenticon';
import { useMemo } from 'react';
import en from './en.json';
import de from './de.json';

interface AttraccessUserProps {
  user?: User;
  description?: UserProps['description'];
}

export function AttraccessUser(props: AttraccessUserProps & Omit<UserProps, 'avatarProps' | 'description' | 'name'>) {
  const { user, description, ...userComponentProps } = props;

  const { t } = useTranslations({ en, de });

  const avatarIcon = useMemo(() => {
    const svg = toSvg(user?.id || 'unknown', 100);
    const svgBase64 = btoa(svg);
    const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;
    return dataUrl;
  }, [user]);

  return (
    <UserComponent
      {...userComponentProps}
      avatarProps={{
        src: avatarIcon,
      }}
      description={description}
      name={user?.username || t('unknown')}
    />
  );
}
