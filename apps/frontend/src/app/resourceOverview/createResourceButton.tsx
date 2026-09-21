import { Button } from '@heroui/react';
import { useAuth } from '../../hooks/useAuth';
import { PlusIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ResourceEditModal } from '../resources/editModal/resourceEditModal';
import en from './toolbar/toolbar.en.json';
import de from './toolbar/toolbar.de.json';

export function CreateResourceButton({ testId }: { testId?: string }) {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { t } = useTranslations({ en, de });

  if (!hasPermission('resources.create')) return null;

  return (
    <ResourceEditModal onUpdated={(resource) => navigate(`/resources/${resource.id}`)} closeOnSuccess>
      {(onOpen) => (
        <Button variant="primary" onPress={onOpen} data-cy={testId}>
          <PlusIcon size={18} />
          {t('addResource')}
        </Button>
      )}
    </ResourceEditModal>
  );
}
