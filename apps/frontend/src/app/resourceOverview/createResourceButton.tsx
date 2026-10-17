import { useAuth } from '../../hooks/useAuth';
import { Button } from '@heroui/react';
import { Plus } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './createResourceDrawer.en.json';
import de from './createResourceDrawer.de.json';

export function CreateResourceButton({ testId, onOpen }: { testId?: string; onOpen: () => void }) {
  const { hasPermission } = useAuth();
  const { t } = useTranslations({ en, de });

  if (!hasPermission('resources.create')) return null;
  return (
    <Button variant="primary" onPress={onOpen} data-cy={testId}>
      <Plus size={18} />
      {t('title')}
    </Button>
  );
}
