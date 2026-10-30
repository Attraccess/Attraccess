// Lets an admin approve a new device by entering the rotating code it shows
// FEATURE: ATT-1168 Device enrollment
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Description,
  Form,
  Input,
  Label,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  TextField,
} from '@heroui/react';
import { ScanIcon } from 'lucide-react';
import { Button, StandardModal, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../components/toastProvider';
import { useDeviceEnrollmentStore } from '../../stores/deviceEnrollment.store';
import { ResourceScanner } from '../resourceOverview/toolbar/scanner';
import {
  DEVICE_ENROLLMENT_PARAM,
  enrollmentCodeFromScan,
  formatEnrollmentCode,
  normalizeEnrollmentCode,
} from './enrollmentCode';
import { useApproveDeviceEnrollment } from './useApproveDeviceEnrollment';
import en from './en.json';
import de from './de.json';

/** Matches the API limit on device names. */
const NAME_MAX_LENGTH = 64;

interface Props {
  /** Signed in, past the two-factor gate, and allowed to update resources. */
  canEnroll: boolean;
}

/**
 * Mount once in the app shell. Opens from the "Enroll device" button, from a `?enroll=` link, or
 * after a camera scan. Renders nothing while closed. On approval it opens the new reader's editor.
 */
export function DeviceEnrollModal({ canEnroll }: Readonly<Props>) {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const toast = useToastMessage();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isOpen, code: initialCode, open, close } = useDeviceEnrollmentStore();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { approve, isPending } = useApproveDeviceEnrollment({
    onSuccess: (approved) => {
      close();
      toast.success({ title: t('success.title'), description: t('success.description', { name: approved.name }) });
      navigate(`/attractap/readers?editReader=${approved.id}`);
    },
    onError: setError,
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
    setCode(initialCode.toUpperCase());
    setName('');
    setError(null);
  }, [isOpen, initialCode]);

  const normalizedCode = normalizeEnrollmentCode(code);

  const submit = useCallback(() => {
    if (!normalizedCode || isPending) return;
    setError(null);
    approve(normalizedCode, name);
  }, [normalizedCode, name, isPending, approve]);

  const onScanned = useCallback((rawValue: string) => {
    const scanned = enrollmentCodeFromScan(rawValue);
    if (!scanned) return false;
    setCode(formatEnrollmentCode(scanned));
    setError(null);
    return true;
  }, []);

  if (!isOpen || !canEnroll) return null;

  return (
    <StandardModal
      isOpen
      onOpenChange={(next) => {
        if (!next) close();
      }}
      size="md"
      data-cy="device-enroll"
    >
      <ModalHeader>
        <ModalHeading>{t('form.title')}</ModalHeading>
        <Description>{t('form.description')}</Description>
      </ModalHeader>
      <ModalBody>
        <Form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
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
          <TextField value={name} onChange={setName} isDisabled={isPending} maxLength={NAME_MAX_LENGTH}>
            <Label>{t('form.nameLabel')}</Label>
            <Input autoComplete="off" data-cy="device-enroll-name" />
          </TextField>
          {/* Camera access needs HTTPS or localhost; typing always works. */}
          {window.isSecureContext && (
            <ResourceScanner title={t('form.scan')} onDetected={onScanned}>
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
          {/* Lets Enter in either field submit. */}
          <input type="submit" hidden />
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onPress={close} isDisabled={isPending}>
          {t('form.cancel')}
        </Button>
        <Button
          variant="primary"
          onPress={submit}
          isPending={isPending}
          isDisabled={!normalizedCode}
          data-cy="device-enroll-submit"
        >
          {t('form.submit')}
        </Button>
      </ModalFooter>
    </StandardModal>
  );
}
