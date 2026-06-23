import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Spinner } from '@heroui/react';
import { useAuth } from '../../../hooks/useAuth';
import { LoginForm } from '../../unauthorized/loginForm';
import { PasswordResetForm } from '../../unauthorized/password-reset/passwordResetForm';
import { ResourceOverviewTab } from '../../resources/details/overview/ResourceOverviewTab';
import { useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';
import { filenameToUrl } from '../../../api';
import { ShapesIcon } from 'lucide-react';

function KioskLogin() {
  const [view, setView] = useState<'login' | 'forgot'>('login');

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {view === 'login' && (
        <LoginForm
          onNeedsAccount={() => undefined}
          onForgotPassword={() => setView('forgot')}
        />
      )}
      {view === 'forgot' && <PasswordResetForm onGoBack={() => setView('login')} />}
    </div>
  );
}

function KioskResourceContent({ resourceId }: { resourceId: number }) {
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
        Resource not found.
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        {resource.imageFilename ? (
          <img
            src={filenameToUrl(resource.imageFilename)}
            alt={resource.name}
            className="w-14 h-14 rounded-xl object-cover"
          />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-default-200 flex items-center justify-center">
            <ShapesIcon className="w-8 h-8 text-default-500" />
          </div>
        )}
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
