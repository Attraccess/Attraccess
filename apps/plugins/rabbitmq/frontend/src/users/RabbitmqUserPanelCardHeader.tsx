import { Button } from '@attraccess/plugins-frontend-ui';
import { Card } from '@heroui/react';
import { PlusIcon, RefreshCwIcon, UsersIcon } from 'lucide-react';
import { useRabbitmqTranslations } from '../i18n';

interface RabbitmqUserPanelCardHeaderProps {
  reload: () => Promise<void>;
  loading: boolean;
  mqttServerId: number;
  onCreate: () => void;
  canManage: boolean;
}

export function RabbitmqUserPanelCardHeader({
  reload,
  loading,
  mqttServerId,
  onCreate,
  canManage,
}: RabbitmqUserPanelCardHeaderProps) {
  const { t } = useRabbitmqTranslations();
  return (
    <Card.Header className="rmq:flex rmq:flex-row rmq:items-center rmq:justify-between rmq:gap-2">
      <div className="rmq:flex rmq:items-center rmq:gap-2">
        <UsersIcon className="rmq:w-5 rmq:h-5 rmq:text-accent-soft-foreground" />
        <h3 className="rmq:text-base rmq:font-semibold rmq:text-default-700">{t('users.title')}</h3>
      </div>
      <div className="rmq:flex rmq:items-center rmq:gap-2">
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={t('users.reload')}
          onPress={() => void reload()}
          isPending={loading}
          data-cy={`rabbitmq-user-panel-reload-${mqttServerId}`}
        >
          <RefreshCwIcon className="rmq:w-4 rmq:h-4" />
        </Button>
        {canManage && (
          <Button
            size="sm"
            variant="primary"
            onPress={onCreate}
            data-cy={`rabbitmq-user-panel-create-button-${mqttServerId}`}
          >
            <PlusIcon className="rmq:w-4 rmq:h-4" />
            {t('users.add')}
          </Button>
        )}
      </div>
    </Card.Header>
  );
}
