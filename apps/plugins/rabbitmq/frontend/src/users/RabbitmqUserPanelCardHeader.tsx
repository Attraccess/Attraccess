import { Button, Card, Spinner } from '@heroui/react';
import { PlusIcon, RefreshCwIcon, UsersIcon } from 'lucide-react';
import { useRabbitmqUserPanelState } from './useRabbitmqUserPanelState';
type Props = Pick<
  ReturnType<typeof useRabbitmqUserPanelState>,
  't' | 'reload' | 'loading' | 'mqttServerId' | 'setFormUser' | 'setFormOpen'
>;
export function RabbitmqUserPanelCardHeader({ t, reload, loading, mqttServerId, setFormUser, setFormOpen }: Props) {
  return (
    <Card.Header className="rmq:flex rmq:flex-row rmq:items-center rmq:justify-between rmq:gap-2">
      <div className="rmq:flex rmq:items-center rmq:gap-2">
        <UsersIcon className="rmq:w-5 rmq:h-5 rmq:text-accent-soft-foreground" />
        <p className="rmq:text-base rmq:font-semibold rmq:text-default-700">{t('users.title')}</p>
      </div>
      <div className="rmq:flex rmq:items-center rmq:gap-2">
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={t('users.reload')}
          onPress={() => void reload()}
          isDisabled={loading}
          data-cy={`rabbitmq-user-panel-reload-${mqttServerId}`}
        >
          {loading ? <Spinner size="sm" /> : <RefreshCwIcon className="rmq:w-4 rmq:h-4" />}
        </Button>
        <Button
          size="sm"
          variant="primary"
          onPress={() => {
            setFormUser(null);
            setFormOpen(true);
          }}
          data-cy={`rabbitmq-user-panel-create-button-${mqttServerId}`}
        >
          <PlusIcon className="rmq:w-4 rmq:h-4" />
          {t('users.add')}
        </Button>
      </div>
    </Card.Header>
  );
}
