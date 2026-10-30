// Approves a waiting device by its code; shared by the enroll dialog and the web flasher
// FEATURE: ATT-1168 Device enrollment
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  ApproveDeviceEnrollmentResponseDto,
  UseAttractapServiceGetReadersKeyFn,
  useDeviceEnrollmentServiceApproveDeviceEnrollment,
} from '@attraccess/react-query-client';
import { getApiErrorMessage } from '../../utils/apiError';
import en from './en.json';
import de from './de.json';

interface Options {
  onSuccess?: (approved: ApproveDeviceEnrollmentResponseDto) => void;
  /** Receives a translated message explaining why the approval failed. */
  onError?: (message: string) => void;
}

export function useApproveDeviceEnrollment({ onSuccess, onError }: Options = {}) {
  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();

  const { mutate, isPending } = useDeviceEnrollmentServiceApproveDeviceEnrollment({
    onSuccess: (approved) => {
      void queryClient.invalidateQueries({ queryKey: UseAttractapServiceGetReadersKeyFn() });
      onSuccess?.(approved);
    },
    onError: (failure) => {
      const status = (failure as ApiError)?.status;
      if (status === 404) onError?.(t('error.notFound'));
      else if (status === 429) onError?.(t('error.tooManyAttempts'));
      else if (status === 502) onError?.(t('error.deliveryFailed'));
      else onError?.(t('error.generic', { error: getApiErrorMessage(failure as ApiError) }));
    },
  });

  const approve = (code: string, name?: string) =>
    mutate({ requestBody: { code, ...(name?.trim() ? { name: name.trim() } : {}) } });

  return { approve, isPending };
}
