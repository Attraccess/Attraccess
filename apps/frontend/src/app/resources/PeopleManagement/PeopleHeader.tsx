import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
} from '@heroui/react';
import { AwardIcon, ChevronDownIcon, ShieldCheckIcon, UserPlusIcon } from 'lucide-react';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../components/pageHeader';
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

  return (
    <PageHeader
      title={t('title')}
      subtitle={t('subtitle')}
      icon={<ShieldCheckIcon />}
      noMargin
      actions={
        showBothAdd ? (
          <Dropdown>
            <DropdownTrigger aria-label={t('addPerson')} data-cy="people-add-person">
              <Button variant="primary">
                <UserPlusIcon className="w-4 h-4" />
                {t('addPerson')}
                <ChevronDownIcon className="w-4 h-4" />
              </Button>
            </DropdownTrigger>
            <DropdownPopover>
              <DropdownMenu aria-label={t('addPerson')}>
                <DropdownItem
                  key="introduction"
                  id="introduction"
                  onPress={() => onAdd('introduction')}
                  data-cy="people-add-introduction"
                >
                  <ShieldCheckIcon className="w-4 h-4 inline mr-2" />
                  {t('addOptions.introduction')}
                </DropdownItem>
                <DropdownItem
                  key="introducer"
                  id="introducer"
                  onPress={() => onAdd('introducer')}
                  data-cy="people-add-introducer"
                >
                  <AwardIcon className="w-4 h-4 inline mr-2" />
                  {t('addOptions.introducer')}
                </DropdownItem>
              </DropdownMenu>
            </DropdownPopover>
          </Dropdown>
        ) : (
          <Button
            variant="primary"
            onPress={() => onAdd(canManageIntroducers ? 'introducer' : 'introduction')}
            data-cy="people-add-person"
          >
            <UserPlusIcon className="w-4 h-4" />
            {canManageIntroducers ? t('addOptions.introducer') : t('addOptions.introduction')}
          </Button>
        )
      }
    />
  );
}
