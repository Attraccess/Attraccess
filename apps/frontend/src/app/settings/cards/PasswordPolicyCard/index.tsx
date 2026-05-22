import { Button, Card } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheckIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../../components/pageHeader';
import en from './en.json';
import de from './de.json';

export function PasswordPolicyCard() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  return (
    <Card className="flex-1 min-w-[300px]">
      <Card.Header>
        <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<ShieldCheckIcon size={18} />} noMargin />
      </Card.Header>
      <Card.Content>
        <Button variant="primary" onPress={() => navigate('/settings/security/password-policy')}>
          {t('openButton')}
        </Button>
      </Card.Content>
    </Card>
  );
}
