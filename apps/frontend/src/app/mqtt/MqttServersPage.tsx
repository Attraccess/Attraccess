import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button, DrawerBody, DrawerHeader } from '@heroui/react';
import { Navigate } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import en from './translations/en.json';
import de from './translations/de.json';
import { MqttServerList } from './servers/MqttServerList';
import { CreateMqttServerForm } from './servers/CreateMqttServerPage';
import { PageHeader } from '../../components/pageHeader';
import { StandardDrawer } from '../../components/standardDrawer';

export function MqttServersPage() {
  const { hasPermission } = useAuth();
  const { t } = useTranslations({ en, de });

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const canManageMqtt = hasPermission('resources.update');

  const close = useCallback(() => setIsCreateOpen(false), []);

  if (!canManageMqtt) {
    return <Navigate to="/" />;
  }

  return (
    <div>
      <PageHeader
        title={t('title')}
        actions={[
          {
            key: 'add-server',
            label: t('addNewServer'),
            icon: <Plus size={16} />,
            variant: 'primary',
            onPress: () => setIsCreateOpen(true),
            dataCy: 'mqtt-servers-page-add-new-server-button',
          },
        ]}
      />
      <MqttServerList />
      <StandardDrawer
        isOpen={isCreateOpen}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DrawerHeader>
          <div className="flex w-full items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">{t('addNewMqttServer')}</h2>
            <Button isIconOnly variant="ghost" aria-label={t('close')} onPress={close}>
              <X size={16} />
            </Button>
          </div>
        </DrawerHeader>
        <DrawerBody>
          <CreateMqttServerForm onSuccess={close} onCancel={close} />
        </DrawerBody>
      </StandardDrawer>
    </div>
  );
}
