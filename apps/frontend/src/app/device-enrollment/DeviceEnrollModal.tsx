// Lets an admin approve a new device by entering the rotating code it shows
// FEATURE: ATT-1168 Device enrollment
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Description, Input, Label, TextField } from '@heroui/react';
import { ScanIcon } from 'lucide-react';
import { Button, StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  ApproveDeviceEnrollmentResponseDto,
  useDeviceEnrollmentServiceApproveDeviceEnrollment,
} from '@attraccess/react-query-client';
import { getApiErrorMessage } from '../../utils/apiError';
import { useDeviceEnrollmentStore } from '../../stores/deviceEnrollment.store';
import { ResourceScanner } from '../resourceOverview/toolbar/scanner';
import en from './en.json';
import de from './de.json';

/** Query parameter of the link a device (or its QR code) points to. */
export const DEVICE_ENROLLMENT_PARAM = 'enroll';

/** Where a device's QR code points: the app opens the enroll dialog with the code filled in. */
export function deviceEnrollmentUrl(code: string): string {
  const url = new URL(window.location.origin);
  url.pathname = '/';
  url.searchParams.set(DEVICE_ENROLLMENT_PARAM, code);
  return url.toString();
}

interface Props {
  /** Signed in, past the two-factor gate, and allowed to update resources. */
  canEnroll: boolean;
}

/**
 * Mount once in the app shell. Opens from the "Enroll device" button, from a `?enroll=` link, or
 * after a camera scan. Renders nothing while closed.
 */
export function DeviceEnrollModal({ canEnroll }: Readonly<Props>) {
  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isOpen, code: initialCode, open, close } = useDeviceEnrollmentStore();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApproveDeviceEnrollmentResponseDto | null>(null);

  const { mutate: approve, isPending } = useDeviceEnrollmentServiceApproveDeviceEnrollment({
    onSuccess: (approved) => {
      setResult(approved);
      void queryClient.invalidateQueries();
    },
    onError: (failure) => {
      const status = (failure as ApiError)?.status;
      if (status === 404) setError(t('error.notFound'));
      else if (status === 429) setError(t('error.tooManyAttempts'));
      else if (status === 502) setError(t('error.deliveryFailed'));
      else setError(t('error.generic', { error: getApiErrorMessage(failure as ApiError) }));
    },
  });

  // A link or a scan lands here as ?enroll=CODE. Take the code and drop it from the URL so a
  // reload or a shared link does not reopen the dialog.
  const linkedCode = searchParams.get(DEVICE_ENROLLMENT_PARAM);
  useEffect(() => {
    if (!linkedCode || !canEnroll) return;
    open(linkedCode);
    setSearchParams(
      (params) => {
        params.delete(DEVICE_ENROLLMENT_PARAM);
        return params;
      },
      { replace: true },
    );
  }, [linkedCode, canEnroll, open, setSearchParams]);

  useEffect(() => {
    if (!isOpen) return;
    setCode(initialCode);
    setName('');
    setError(null);
    setResult(null);
  }, [isOpen, initialCode]);

  const submit = useCallback(() => {
    if (!code.trim() || isPending) return;
    setError(null);
    approve({ requestBody: { code, ...(name.trim() ? { name: name.trim() } : {}) } });
  }, [code, name, isPending, approve]);

  if (!isOpen || !canEnroll) return null;

  if (result) {
    return (
      <StatusDialog
        isOpen
        onClose={close}
        status="success"
        title={t('success.title')}
        closeLabel={t('close')}
        action={{
          label: t('success.openReader'),
          onPress: () => {
            close();
            navigate(`/attractap/readers?editReader=${result.id}`);
          },
          'data-cy': 'device-enroll-open-reader',
        }}
        data-cy="device-enroll-success"
      >
        {t('success.description', { name: result.name })}
      </StatusDialog>
    );
  }

  return (
    <StatusDialog
      isOpen
      onClose={close}
      status="info"
      title={t('form.title')}
      action={{
        label: t('form.submit'),
        onPress: submit,
        isPending,
        isDisabled: !code.trim(),
        'data-cy': 'device-enroll-submit',
      }}
      data-cy="device-enroll"
    >
      <div className="flex flex-col gap-3">
        <Description>{t('form.description')}</Description>
        <TextField
          value={code}
          onChange={(value) => {
            setCode(value.toUpperCase());
            setError(null);
          }}
          autoFocus
          isDisabled={isPending}
        >
          <Label>{t('form.codeLabel')}</Label>
          <Input
            placeholder={t('form.codePlaceholder')}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            data-cy="device-enroll-code"
          />
        </TextField>
        <TextField value={name} onChange={setName} isDisabled={isPending}>
          <Label>{t('form.nameLabel')}</Label>
          <Input autoComplete="off" data-cy="device-enroll-name" />
        </TextField>
        {/* Camera access needs HTTPS or localhost; typing always works. */}
        {window.isSecureContext && (
          <ResourceScanner title={t('form.scan')}>
            {(openScanner) => (
              <Button variant="secondary" onPress={openScanner} data-cy="device-enroll-scan">
                <ScanIcon className="w-4 h-4" />
                {t('form.scan')}
              </Button>
            )}
          </ResourceScanner>
        )}
        {error && (
          <Description className="text-danger" role="alert">
            {error}
          </Description>
        )}
      </div>
    </StatusDialog>
  );
}
