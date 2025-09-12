import { useTranslations, useUrlQuery } from '@attraccess/plugins-frontend-ui';
import { useCallback, useEffect, useRef } from 'react';
import { QrCodeAction } from './qrcode/action';
import {
  useResourcesServiceResourceUsageStartSession,
  useResourcesServiceResourceUsageEndSession,
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn,
  UseResourcesServiceResourceUsageGetHistoryKeyFn,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useToastMessage } from '../../../components/toastProvider';

import de from './useQrCodeAction.de.json';
import en from './useQrCodeAction.en.json';
import { useNavigate } from 'react-router-dom';

interface Props {
  resourceId: number;
}

export function useQrCodeAction(props: Props) {
  const { resourceId } = props;
  const urlSearchParams = useUrlQuery();
  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const navigate = useNavigate();
  const actionExecutedRef = useRef<string | null>(null);

  const { t } = useTranslations({
    en,
    de,
  });

  const { mutate: startResourceMutate } = useResourcesServiceResourceUsageStartSession({
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: UseResourcesServiceResourceUsageGetActiveSessionKeyFn({ resourceId }),
      });

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

      toast.success({
        title: variables.requestBody.forceTakeOver
          ? t('actions.startAndTakeover.success.title')
          : t('actions.start.success.title'),
        description: variables.requestBody.forceTakeOver
          ? t('actions.startAndTakeover.success.description')
          : t('actions.start.success.description'),
      });
    },
  });

  const { mutate: endResourceMutate } = useResourcesServiceResourceUsageEndSession({
    onSuccess: () => {
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

      queryClient.resetQueries({
        queryKey: UseResourcesServiceResourceUsageGetActiveSessionKeyFn({ resourceId }),
      });

      toast.success({
        title: t('actions.stop.success.title'),
        description: t('actions.stop.success.description'),
      });
    },
  });

  const startResource = useCallback(
    (forceTakeOver: boolean) => {
      startResourceMutate({
        resourceId,
        requestBody: {
          notes: '-- by QR-Code --',
          forceTakeOver,
        },
      });
    },
    [startResourceMutate, resourceId],
  );

  const stopResource = useCallback(() => {
    endResourceMutate({
      resourceId,
      requestBody: {
        notes: '-- by QR-Code --',
      },
    });
  }, [endResourceMutate, resourceId]);

  useEffect(() => {
    const action = urlSearchParams.get('action');

    if (!action || actionExecutedRef.current === action) {
      return;
    }

    // Store the current action to prevent double execution
    actionExecutedRef.current = action;

    // remove the action from the url
    navigate(`/resources/${resourceId}`, { replace: true });

    switch (action) {
      case QrCodeAction.Start:
        startResource(false);
        break;
      case QrCodeAction.StartAndTakeover:
        startResource(true);
        break;
      case QrCodeAction.Stop:
        stopResource();
        break;
      case QrCodeAction.View:
        break;
    }
  }, [urlSearchParams, startResource, stopResource, navigate, resourceId]);
}
