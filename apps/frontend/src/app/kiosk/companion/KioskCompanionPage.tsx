import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@heroui/react';
import { ShapesIcon, ChevronRight } from 'lucide-react';
import { OpenAPI } from '@attraccess/react-query-client';
import { useResourcesServiceResourceUsageGetActiveSession, useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';
import { filenameToUrl } from '../../../api';

interface CompanionResource {
  id: number;
  name: string;
  description?: string;
  imageFilename?: string;
}

function useCompanionDeviceResources(deviceId: string | null) {
  return useQuery({
    queryKey: ['companion-device-resources', deviceId],
    queryFn: async (): Promise<CompanionResource[]> => {
      if (!deviceId) return [];
      const res = await fetch(`${OpenAPI.BASE}/api/companion-devices/${encodeURIComponent(deviceId)}/resources`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch companion device resources');
      return res.json();
    },
    enabled: !!deviceId,
    refetchInterval: 10_000,
  });
}

function ResourceRow({ resource, autoLogoff }: { resource: CompanionResource; autoLogoff: string | null }) {
  const navigate = useNavigate();
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
      {resource.imageFilename ? (
        <img
          src={filenameToUrl(resource.imageFilename)}
          alt={resource.name}
          className="w-12 h-12 rounded-lg object-cover shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-default-200 flex items-center justify-center shrink-0">
          <ShapesIcon className="w-6 h-6 text-default-500" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{resource.name}</p>
        {resource.description && (
          <p className="text-sm text-default-500 truncate">{resource.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`w-2.5 h-2.5 rounded-full ${isInUse ? 'bg-success' : 'bg-default-300'}`}
          title={isInUse ? 'In use' : 'Available'}
        />
        <ChevronRight className="w-4 h-4 text-default-400" />
      </div>
    </button>
  );
}

export function KioskCompanionPage() {
  const [params] = useSearchParams();
  const deviceId = params.get('deviceId');
  const autoLogoff = params.get('autoLogoff');

  const { data: resources, isLoading, error } = useCompanionDeviceResources(deviceId);

  if (!deviceId) {
    return (
      <div className="w-full max-w-lg mx-auto text-center text-default-500 py-12">
        No device ID specified.
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
        Failed to load resources for this device.
      </div>
    );
  }

  if (!resources || resources.length === 0) {
    return (
      <div className="w-full max-w-lg mx-auto text-center text-default-500 py-12 space-y-2">
        <ShapesIcon className="w-12 h-12 mx-auto text-default-300 mb-4" />
        <p className="font-medium text-lg">No resources linked</p>
        <p className="text-sm">
          This companion device is not yet wired to any resource flow. Ask your administrator to add a Lock PC or Unlock
          PC node in a resource flow and select this device.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto space-y-3">
      <h1 className="text-2xl font-bold mb-6 text-center">Select a resource</h1>
      {resources.map((r) => (
        <ResourceRow key={r.id} resource={r} autoLogoff={autoLogoff} />
      ))}
    </div>
  );
}
