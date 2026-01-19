import { PageHeader } from '../../components/pageHeader';
import { Card, CardBody, CardHeader } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { UsernameForm } from './username';
import { SetPasswordForm } from '../user-management/details/components/setPasswordForm';
import { useAuth } from '../../hooks/useAuth';
import { TwoFactorCard } from './two-factor';

export default function AccountPage() {
  const { t } = useTranslations({ en, de });

  const { user: me } = useAuth();

  return (
    <div>
      <PageHeader title={t('title')} backTo="/" />

      <div className="flex flex-row flex-wrap gap-4">
        <Card className="max-w-md">
          <CardHeader>
            <PageHeader title={t('sections.profile')} noMargin />
          </CardHeader>
          <CardBody className="flex flex-col gap-2">
            <UsernameForm />
          </CardBody>
        </Card>

        <Card className="max-w-md">
          <CardHeader>
            <PageHeader title={t('sections.security')} noMargin />
          </CardHeader>
          <CardBody className="flex flex-col gap-6">
            {me && <SetPasswordForm userId={me.id} />}
            {me && <TwoFactorCard />}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
