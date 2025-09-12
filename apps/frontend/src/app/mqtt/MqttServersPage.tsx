import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button, Card, CardHeader } from '@heroui/react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import en from './translations/en.json';
import de from './translations/de.json';
import { MqttServerList } from './servers/MqttServerList';

export function MqttServersPage() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslations({ en, de });

  const canManageMqtt = hasPermission('canManageResources');

  // Redirect if user doesn't have permission
  if (!canManageMqtt) {
    return <Navigate to="/" />;
  }

  const handleAddNewServer = () => {
    navigate('/mqtt/servers/create');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Card data-cy="mqtt-servers-page-card">
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>{t('title')}</h2>
            <Button
              color="primary"
              startContent={<Plus size={16} />}
              onPress={handleAddNewServer}
              data-cy="mqtt-servers-page-add-new-server-button"
            >
              {t('addNewServer')}
            </Button>
          </div>
        </CardHeader>
        <div style={{ padding: '1rem' }}>
          <MqttServerList />
        </div>
      </Card>
    </div>
  );
}
