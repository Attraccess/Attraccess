import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spinner } from '@heroui/react';
import { ShapesIcon, ChevronRight } from 'lucide-react';
import {
  useCompanionDevicesServiceGetCompanionDeviceResources,
  useResourcesServiceResourceUsageGetActiveSession,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ResourceImage } from '../../../components/ResourceImage';
import en from './KioskCompanionPage.en.json';
import de from './KioskCompanionPage.de.json';

interface CompanionResource {
  id: number;
  name: string;
  description?: string;
  imageFilename?: string;
}

function ResourceRow({ resource, autoLogoff }: { resource: CompanionResource; autoLogoff: string | null }) {
  const navigate = useNavigate();
  const { t } = useTranslations({ en, de });
  const { data: sessionData } = useResourcesServiceResourceUsageGetActiveSession(
    { resourceId: resource.id },
    undefined,
    { refetchInterval: 5000 },
  );

  const isInUse = !!sessionData?.usage;
  const to = `/kiosk/resources/${resource.id}${autoLogoff ? `?autoLogoff=${autoLogoff}` : ''}`;

  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="w-full flex items-center gap-4 p-4 rounded-xl bg-default-100 hover:bg-default-200 transition-colors text-left"
    >
      <ResourceImage
        imageFilename={resource.imageFilename}
        name={resource.name}
        className="w-12 h-12 rounded-lg shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{resource.name}</p>
        {resource.description && (
          <p className="text-sm text-default-500 truncate">{resource.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`w-2.5 h-2.5 rounded-full ${isInUse ? 'bg-success' : 'bg-default-300'}`}
          title={isInUse ? t('status.inUse') : t('status.available')}
        />
        <ChevronRight className="w-4 h-4 text-default-400" />
      </div>
    </button>
  );
}

export function KioskCompanionPage() {
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
      <h1 className="text-2xl font-bold mb-6 text-center">{t('title')}</h1>
      {resources.map((r) => (
        <ResourceRow key={r.id} resource={r} autoLogoff={autoLogoff} />
      ))}
    </div>
  );
}
