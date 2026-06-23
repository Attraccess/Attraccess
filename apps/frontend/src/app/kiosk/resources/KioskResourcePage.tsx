import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Spinner } from '@heroui/react';
import { useAuth } from '../../../hooks/useAuth';
import { LoginForm } from '../../unauthorized/loginForm';
import { PasswordResetForm } from '../../unauthorized/password-reset/passwordResetForm';
import { ResourceOverviewTab } from '../../resources/details/overview/ResourceOverviewTab';
import { useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ResourceImage } from '../../../components/ResourceImage';
import en from './KioskResourcePage.en.json';
import de from './KioskResourcePage.de.json';

function KioskLogin() {
  const [view, setView] = useState<'login' | 'forgot'>('login');

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {view === 'login' && (
        <LoginForm
          onNeedsAccount={null}
          onForgotPassword={() => setView('forgot')}
        />
      )}
      {view === 'forgot' && <PasswordResetForm onGoBack={() => setView('login')} />}
    </div>
  );
}

function KioskResourceContent({ resourceId }: { resourceId: number }) {
  const { t } = useTranslations({ en, de });
  const { data: resource, isLoading } = useResourcesServiceGetOneResourceById({ id: resourceId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Spinner color="accent" />
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="text-center text-muted-foreground py-12">
        {t('notFound')}
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <ResourceImage
          imageFilename={resource.imageFilename}
          name={resource.name}
          className="w-14 h-14 rounded-xl"
          iconClassName="w-8 h-8"
        />
        <div>
          <h1 className="text-2xl font-bold">{resource.name}</h1>
          {resource.description && (
            <p className="text-default-500 text-sm mt-1">{resource.description}</p>
          )}
        </div>
      </div>

      <ResourceOverviewTab />
    </div>
  );
}

export function KioskResourcePage() {
  const { id } = useParams<{ id: string }>();
  const resourceId = Number.parseInt(id ?? '', 10);
  const { isAuthenticated, isInitialized } = useAuth();

  if (!Number.isFinite(resourceId)) {
    return <Navigate to="/" replace />;
  }

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Spinner color="accent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <KioskLogin />;
  }

  return <KioskResourceContent resourceId={resourceId} />;
}
