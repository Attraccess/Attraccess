import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spinner } from '@heroui/react';
import { ShapesIcon } from 'lucide-react';
import { useCompanionDevicesServiceGetCompanionDeviceResources } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../hooks/useAuth';
import { KioskLogin } from '../login/KioskLogin';
import { ResourceListItem } from '../../../components/ResourceListItem';
import en from './KioskCompanionPage.en.json';
import de from './KioskCompanionPage.de.json';

interface CompanionResource {
  id: number;
  name: string;
  description?: string;
  imageFilename?: string;
}

export function KioskCompanionPage() {
  const { isAuthenticated, isInitialized } = useAuth();

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

  return <KioskCompanionContent />;
}

function KioskCompanionContent() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { t } = useTranslations({ en, de });
  const deviceId = params.get('deviceId');
  const autoLogoff = params.get('autoLogoff');

  const { data: rawResources, isLoading, error } = useCompanionDevicesServiceGetCompanionDeviceResources(
    { id: Number(deviceId) },
    undefined,
    { enabled: !!deviceId, refetchInterval: 10_000 },
  );
  const resources = rawResources as CompanionResource[] | undefined;

  if (!deviceId) {
    return (
      <div className="w-full max-w-lg mx-auto text-center text-default-500 py-12">
        {t('noDeviceId')}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Spinner color="accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-lg mx-auto text-center text-danger py-12">
        {t('loadError')}
      </div>
    );
  }

  if (!resources || resources.length === 0) {
    return (
      <div className="w-full max-w-lg mx-auto text-center text-default-500 py-12 space-y-2">
        <ShapesIcon className="w-12 h-12 mx-auto text-default-300 mb-4" />
        <p className="font-medium text-lg">{t('empty.title')}</p>
        <p className="text-sm">{t('empty.description')}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto space-y-3">
      {resources.map((r) => (
        <ResourceListItem
          key={r.id}
          resource={r}
          onPress={() => navigate(`/kiosk/resources/${r.id}?deviceId=${deviceId}${autoLogoff ? `&autoLogoff=${autoLogoff}` : ''}`)}
        />
      ))}
    </div>
  );
}
