import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button } from '@heroui/react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import en from './translations/en.json';
import de from './translations/de.json';
import { MqttServerList } from './servers/MqttServerList';
import { PageHeader } from '../../components/pageHeader';

export function MqttServersPage() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslations({ en, de });

  const canManageMqtt = hasPermission('canManageResources');

  // Redirect if user doesn't have permission
  if (!canManageMqtt) {
    return <Navigate />;
  }

  const handleAddNewServer = () => {
    navigate('/mqtt/servers/create');
  };

  return (
    <div>
      <PageHeader
        title={t('title')}
        actions={
          <Button variant="ghost"
            onPress={handleAddNewServer}
            data-cy="mqtt-servers-page-add-new-server-button"
          ><Plus size={16} />
            {t('addNewServer')}
          </Button>
        }
      />
      <MqttServerList />
    </div>
  );
}
