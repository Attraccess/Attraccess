import { memo } from 'react';
import { User, Users } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { LabeledSwitch } from '../../../../../components/labeledSwitch';
import en from './translations/en';
import de from './translations/de';

interface ShowAllUsersToggleProps {
  showAllUsers: boolean;
  setShowAllUsers: (value: boolean) => void;
}

export const ShowAllUsersToggle = memo(({ showAllUsers, setShowAllUsers }: ShowAllUsersToggleProps) => {
  const { t } = useTranslations({ en, de });

  const Icon = showAllUsers ? Users : User;
  const label = showAllUsers ? t('showingAllUsers') : t('showingOnlyMe');

  return (
    <LabeledSwitch
      size="sm"
      isSelected={showAllUsers}
      onChange={setShowAllUsers}
      aria-label={t('ariaLabel')}
      data-cy="show-all-users-toggle"
    >
      <span className="flex items-center gap-1 text-sm">
        <Icon className="w-4 h-4" />
        {label}
      </span>
    </LabeledSwitch>
  );
});

ShowAllUsersToggle.displayName = 'ShowAllUsersToggle';
