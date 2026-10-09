import { useCallback, useRef, useState } from 'react';
import { FormResponseDto, FormSubmissionRequestDto, ResourceFormsService } from '@attraccess/react-query-client';
import { ResourceFormAction } from '../../details/forms/types';
import { ResourceFormsModal } from '../components/ResourceFormsModal';

interface PendingRequest {
  action: ResourceFormAction;
  forms: FormResponseDto[];
  resolve: (value: FormSubmissionRequestDto[]) => void;
  reject: (reason?: unknown) => void;
}

export function useResourceFormsSubmission(resourceId: number) {
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  // Retain answers until the enclosing usage operation succeeds or the user cancels.
  const drafts = useRef<{
    resourceId: number;
    values: Partial<Record<ResourceFormAction, FormSubmissionRequestDto[]>>;
  }>({
    resourceId,
    values: {},
  });
  const clearFormsDraft = useCallback(() => {
    drafts.current = { resourceId, values: {} };
  }, [resourceId]);

  const requestForms = useCallback(
    async (action: ResourceFormAction): Promise<FormSubmissionRequestDto[]> => {
      const forms = await ResourceFormsService.resourceFormsGetRequirements({ resourceId, action });
      if (!forms?.length) {
        return [];
      }

      return new Promise<FormSubmissionRequestDto[]>((resolve, reject) => {
        setPendingRequest({ action, forms, resolve, reject });
      });
    },
    [resourceId],
  );

  const handleClose = useCallback(
    (result?: FormSubmissionRequestDto[]) => {
      if (!pendingRequest) {
        return;
      }
      if (result) {
        if (drafts.current.resourceId !== resourceId) clearFormsDraft();
        drafts.current.values[pendingRequest.action] = result;
        pendingRequest.resolve(result);
      } else {
        clearFormsDraft();
        pendingRequest.reject(new Error('user_cancelled_forms'));
      }
      setPendingRequest(null);
    },
    [pendingRequest, resourceId, clearFormsDraft],
  );

  const modal = (
    <ResourceFormsModal
      isOpen={!!pendingRequest}
      action={pendingRequest?.action ?? 'start'}
      forms={pendingRequest?.forms ?? []}
      initialSubmissions={
        pendingRequest && drafts.current.resourceId === resourceId
          ? drafts.current.values[pendingRequest.action]
          : undefined
      }
      onSubmit={(values) => handleClose(values)}
      onCancel={() => handleClose()}
    />
  );

  return { requestForms, modal, clearFormsDraft };
}
