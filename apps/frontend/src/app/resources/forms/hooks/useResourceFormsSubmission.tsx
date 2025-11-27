import { useCallback, useState } from 'react';
import {
  FormResponseDto,
  FormSubmissionRequestDto,
  ResourceFormsService,
} from '@attraccess/react-query-client';
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
        pendingRequest.resolve(result);
      } else {
        pendingRequest.reject(new Error('user_cancelled_forms'));
      }
      setPendingRequest(null);
    },
    [pendingRequest],
  );

  const modal = (
    <ResourceFormsModal
      isOpen={!!pendingRequest}
      action={pendingRequest?.action ?? 'start'}
      forms={pendingRequest?.forms ?? []}
      onSubmit={(values) => handleClose(values)}
      onCancel={() => handleClose()}
    />
  );

  return { requestForms, modal };
}

