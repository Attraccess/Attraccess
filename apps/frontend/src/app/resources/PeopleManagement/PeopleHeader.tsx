import { AwardIcon, ShieldCheckIcon, UserPlusIcon } from 'lucide-react';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { PageAction, PageHeader } from '../../../components/pageHeader';
import { AddMode } from './types';

interface PeopleHeaderProps {
  t: TFunction;
  canManageIntroducers: boolean;
  canManageIntroductions: boolean;
  onAdd: (mode: AddMode) => void;
}

export function PeopleHeader(props: Readonly<PeopleHeaderProps>) {
  const { t, canManageIntroducers, canManageIntroductions, onAdd } = props;

  const canAdd = canManageIntroducers || canManageIntroductions;
  if (!canAdd) {
    return <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<ShieldCheckIcon />} noMargin />;
  }

  const showBothAdd = canManageIntroducers && canManageIntroductions;

  const actions: PageAction[] = showBothAdd
    ? [
        {
          key: 'add-introduction',
          label: t('addOptions.introduction'),
          icon: <ShieldCheckIcon className="w-4 h-4" />,
          variant: 'primary',
          onPress: () => onAdd('introduction'),
          dataCy: 'people-add-introduction',
        },
        {
          key: 'add-introducer',
          label: t('addOptions.introducer'),
          icon: <AwardIcon className="w-4 h-4" />,
          variant: 'primary',
          onPress: () => onAdd('introducer'),
          dataCy: 'people-add-introducer',
        },
      ]
    : [
        {
          key: 'add-person',
          label: canManageIntroducers ? t('addOptions.introducer') : t('addOptions.introduction'),
          icon: <UserPlusIcon className="w-4 h-4" />,
          variant: 'primary',
          onPress: () => onAdd(canManageIntroducers ? 'introducer' : 'introduction'),
          dataCy: 'people-add-person',
        },
      ];

  return (
    <PageHeader
      title={t('title')}
      subtitle={t('subtitle')}
      icon={<ShieldCheckIcon />}
      noMargin
      actions={actions}
    />
  );
}
