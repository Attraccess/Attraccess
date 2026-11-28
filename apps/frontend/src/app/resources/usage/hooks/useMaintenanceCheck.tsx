import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCanManageMaintenance,
  useGetLicenseInformation,
  useGetOneResourceById,
  useListMaintenanceRequestsKey,
  type CreateMaintenanceRequestDto,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../../hooks/useAuth';
import { useToastMessage } from '../../../../components/toastProvider';
import { MaintenanceCheckDialog } from '../components/MaintenanceCheckDialog';
import en from '../components/MaintenanceCheckDialog/en.json';
import de from '../components/MaintenanceCheckDialog/de.json';

/** What the end call sends: nothing, or the maintenance request to file once the session ended. */
export interface MaintenanceCheckAnswer {
  maintenanceRequest?: CreateMaintenanceRequestDto;
}

/** The "Is the machine OK?" check of the end flows in ActiveSessionDisplay and ParallelSessionsDisplay. */
export function useMaintenanceCheck(resourceId: number) {
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { data: license } = useGetLicenseInformation();
  const { data: permissions } = useCanManageMaintenance({ path: { resourceId } });
  const { data: resource } = useGetOneResourceById({ path: { id: resourceId } });
  const [pending, setPending] = useState<{ answer: (value: MaintenanceCheckAnswer | null) => void } | null>(null);

  // The same people who see "Report a problem", on resources that ask.
  const isAsked =
    !!license?.modules.includes('maintenance') &&
    permissions?.canManage === false &&
    !!resource?.askMaintenanceCheckOnSessionEnd;

  /** Resolves with what to send along with the end call, or null when the user cancelled the end. */
  const requestMaintenanceCheck = useCallback(
    (sessionUserId: number | null | undefined): Promise<MaintenanceCheckAnswer | null> => {
      if (!isAsked || !user || sessionUserId !== user.id) return Promise.resolve({});
      return new Promise((answer) => setPending({ answer }));
    },
    [isAsked, user],
  );

  const answer = useCallback(
    (value: MaintenanceCheckAnswer | null) => {
      pending?.answer(value);
      setPending(null);
    },
    [pending],
  );

  /** Tells the user what became of the request; the end response only says so when one was sent. */
  const showMaintenanceRequestResult = useCallback(
    (filed: boolean | undefined) => {
      if (filed === undefined) return;
      if (!filed) {
        toast.warning({ title: t('notFiled.title'), description: t('notFiled.description'), duration: 10_000 });
        return;
      }
      queryClient.invalidateQueries({ queryKey: [useListMaintenanceRequestsKey] });
      toast.success({ title: t('filed.title'), description: t('filed.description') });
    },
    [queryClient, t, toast],
  );

  const modal = (
    <MaintenanceCheckDialog
      isOpen={pending !== null}
      onMachineOk={() => answer({})}
      onNeedsMaintenance={(reason) => answer({ maintenanceRequest: { reason } })}
      onCancel={() => answer(null)}
    />
  );

  return { requestMaintenanceCheck, showMaintenanceRequestResult, modal };
}
