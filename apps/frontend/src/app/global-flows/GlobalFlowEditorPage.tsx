import { Navigate, useParams } from 'react-router-dom';
import { SettingsIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, AlertContent, AlertDescription, AlertTitle, Spinner, useOverlayState } from '@heroui/react';
import { AlertStatusIcon, LabeledSwitch, PageHeader } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  UseGlobalFlowsServiceGetGlobalFlowKeyFn,
  useGlobalFlowsServiceGetGlobalFlow,
  useGlobalFlowsServiceListGlobalFlowsKey,
  useGlobalFlowsServiceUpdateGlobalFlow,
} from '@attraccess/react-query-client';
import { useAuth } from '../../hooks/useAuth';
import { useToastMessage } from '../../components/toastProvider';
import { FlowEditor } from '../resources/details/flows/index';
import { GlobalFlowDetailsModal } from './GlobalFlowDetailsModal';
import { useGlobalFlowsTranslations } from './useGlobalFlowsTranslations';

export function GlobalFlowEditorPage() {
  const { hasPermission } = useAuth();
  const { t, tExists } = useGlobalFlowsTranslations();
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { flowId: flowIdParam } = useParams();
  const flowId = Number(flowIdParam);
  const detailsModal = useOverlayState();

  const { data: flow, isError } = useGlobalFlowsServiceGetGlobalFlow({ flowId }, undefined, {
    enabled: Number.isInteger(flowId) && flowId > 0,
  });

  const update = useGlobalFlowsServiceUpdateGlobalFlow({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: UseGlobalFlowsServiceGetGlobalFlowKeyFn({ flowId }) });
      void queryClient.invalidateQueries({ queryKey: [useGlobalFlowsServiceListGlobalFlowsKey] });
    },
    onError: (error) => toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' }),
  });

  if (!hasPermission('resources.update')) {
    return <Navigate to="/" />;
  }

  if (isError || !Number.isInteger(flowId) || flowId <= 0) {
    return (
      <Alert status="danger" data-cy="global-flow-load-error">
        <AlertStatusIcon status="danger" />
        <AlertContent>
          <AlertDescription>{t('editor.loadError')}</AlertDescription>
        </AlertContent>
      </Alert>
    );
  }

  if (!flow) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner color="accent" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4" data-cy="global-flow-editor">
      <PageHeader
        title={flow.name}
        subtitle={flow.description ?? undefined}
        backTo="/devices/flows"
        noMargin
        actions={[
          {
            key: 'enabled',
            label: t('editor.enabled'),
            renderTrigger: () => (
              <LabeledSwitch
                isSelected={flow.enabled}
                isDisabled={update.isPending}
                onChange={(enabled) => update.mutate({ flowId, requestBody: { enabled } })}
                data-cy="global-flow-enabled-switch"
              >
                {t('editor.enabled')}
              </LabeledSwitch>
            ),
          },
          {
            key: 'edit-details',
            label: t('editor.editDetails'),
            icon: <SettingsIcon size={16} />,
            onPress: detailsModal.open,
            dataCy: 'global-flow-edit-details',
          },
        ]}
      />
      <GlobalFlowDetailsModal isOpen={detailsModal.isOpen} onOpenChange={detailsModal.setOpen} flow={flow} />
      <Alert status="warning" data-cy="global-flow-notice">
        <AlertStatusIcon status="warning" />
        <AlertContent>
          <AlertTitle>{t('editor.noticeTitle')}</AlertTitle>
          <AlertDescription>{t('editor.notice')}</AlertDescription>
        </AlertContent>
      </Alert>
      <div className="min-h-0 flex-1">
        <FlowEditor owner={{ kind: 'global', flowId }} />
      </div>
    </div>
  );
}
