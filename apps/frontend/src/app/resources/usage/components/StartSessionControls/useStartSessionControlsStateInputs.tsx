import { useState, useCallback } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import {
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn,
  UseResourcesServiceResourceUsageGetHistoryKeyFn,
  useResourcesServiceGetOneResourceById,
  StartUsageSessionDto,
  ApiError,
  ResourceType,
  SupervisionMode,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import en from './translations/en.json';
import de from './translations/de.json';
import { getTranslationKeyForApiError } from '../../../../../utils/apiError';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import type { StartSessionControlsProps } from './index';

export function useStartSessionControlsStateInputs(
  props: Readonly<StartSessionControlsProps> & React.HTMLAttributes<HTMLDivElement>,
) {
  const { resourceId, insufficientBalanceDesiredAmount, requiresSupervision, ...divProps } = props;

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });

  // supervision_required forbids a solo start for everyone, introduced or not — the backend rejects
  // it outright. Deciding that here rather than at the call sites means no caller can forget it:
  // the maintenance view renders these controls too, with no knowledge of supervision (ATT-815).
  const needsSupervisor =
    (requiresSupervision ?? false) || resource?.supervisionMode === SupervisionMode.SUPERVISION_REQUIRED;

  const { t, tExists } = useTranslations({
    en: {
      ...en,
      api: API_ERROR_TRANSLATIONS_EN,
    },
    de: {
      ...de,
      api: API_ERROR_TRANSLATIONS_DE,
    },
  });
  const queryClient = useQueryClient();
  const toast = useToastMessage();

  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [isInsufficientBalance, setIsInsufficientBalance] = useState(false);
  const [supervisedRequestBody, setSupervisedRequestBody] = useState<StartUsageSessionDto | null>(null);

  const onStartSuccess = useCallback(() => {
    setIsNotesModalOpen(false);

    // Invalidate the active session query to refetch data
    queryClient.invalidateQueries({
      queryKey: UseResourcesServiceResourceUsageGetActiveSessionKeyFn({ resourceId }),
    });
    // Invalidate all history queries for this resource (regardless of pagination/user filters)
    queryClient.invalidateQueries({
      predicate: (query) => {
        const baseHistoryKey = UseResourcesServiceResourceUsageGetHistoryKeyFn({ resourceId });
        return (
          query.queryKey[0] === baseHistoryKey[0] &&
          query.queryKey.length > 1 &&
          JSON.stringify(query.queryKey[1]).includes(`"resourceId":${resourceId}`)
        );
      },
    });

    if (!resource) {
      return;
    }

    switch (resource.type) {
      case ResourceType.MACHINE:
        toast.success({
          title: t('machine.sessionStarted'),
          description: t('machine.sessionStartedDescription'),
        });
        break;

      case ResourceType.DOOR:
        toast.success({
          title: t('door.success.title'),
          description: t('door.success.description'),
        });
        break;

      default: {
        const exhaustiveCheck: never = resource?.type;
        throw new Error(`Unknown resource type: ${exhaustiveCheck}`);
      }
    }
  }, [resourceId, t, queryClient, toast, resource]);

  const onStartError = useCallback(
    (error: ApiError) => {
      if (!resource) {
        return;
      }

      const { errorMessage } = getTranslationKeyForApiError({
        error,
        t,
        tExists,
        baseTranslationKey: 'api',
      });

      if (errorMessage === 'INSUFFICIENT_BALANCE') {
        setIsInsufficientBalance(true);
      }

      toast.apiError({
        error,
        t,
        tExists,
        baseTranslationKey: 'api',
      });

      console.error('Failed to start session:', JSON.stringify(error));
    },
    [t, toast, resource, tExists],
  );
  return {
    resourceId,
    insufficientBalanceDesiredAmount,
    requiresSupervision,
    divProps,
    resource,
    needsSupervisor,
    t,
    tExists,
    queryClient,
    toast,
    isNotesModalOpen,
    setIsNotesModalOpen,
    isInsufficientBalance,
    setIsInsufficientBalance,
    supervisedRequestBody,
    setSupervisedRequestBody,
    onStartSuccess,
    onStartError,
    props,
  } as const;
}
