import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Button,
  Description,
  Input,
  Label,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  TextField,
} from '@heroui/react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { ApiError, AttractapService, CompanionDevicesService } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { StandardModal } from '../standardModal';
import { useAuth } from '../../hooks/useAuth';
import en from './en.json';
import de from './de.json';

type DeviceType = 'reader' | 'companion';
export function parseEnrollmentQr(value: string, type: DeviceType): string | null {
  const match = /^attraccess-enroll:v1:(reader|companion):([A-Z0-9]{3}-[A-Z0-9]{3})$/.exec(value);
  return match?.[1] === type ? match[2] : null;
}

export function DeviceEnrollment({ type }: { type: DeviceType }) {
  const { hasPermission } = useAuth();
  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState('');
  const approval = useMutation({
    mutationFn: (currentCode: string) =>
      type === 'reader'
        ? AttractapService.approveReaderEnrollment({ requestBody: { code: currentCode } })
        : CompanionDevicesService.approveCompanionEnrollment({ requestBody: { code: currentCode } }),
    onSuccess: () => {
      setNotice('success');
      setCode('');
      setScanning(false);
      void queryClient.invalidateQueries();
    },
    onError: (error) => {
      const status = error instanceof ApiError ? error.status : 0;
      setNotice(
        status === 403 || status === 401
          ? 'denied'
          : status === 404
            ? 'expired'
            : status === 429
              ? 'throttled'
              : status === 409
                ? 'busy'
                : 'failed',
      );
    },
  });
  if (!hasPermission('resources.update')) return null;
  const valid = /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(code);
  return (
    <>
      <Button
        variant="primary"
        onPress={() => {
          setOpen(true);
          setCode('');
          setNotice('');
          approval.reset();
        }}
      >
        {t(`add.${type}`)}
      </Button>
      <StandardModal
        isOpen={open}
        onOpenChange={(value) => {
          if (!approval.isPending) {
            setOpen(value);
            setScanning(false);
          }
        }}
        size="md"
      >
        <ModalHeader>
          <ModalHeading>{t(`title.${type}`)}</ModalHeading>
        </ModalHeader>
        <ModalBody>
          <Description>{t('instructions')}</Description>
          <TextField
            value={code}
            isDisabled={approval.isPending}
            onChange={(value) => {
              const raw = value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
                .slice(0, 6);
              setCode(raw.length > 3 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : raw);
              setNotice('');
            }}
          >
            <Label>{t('code')}</Label>
            <Input autoComplete="off" placeholder="ABC-123" />
          </TextField>
          <Button
            variant="secondary"
            isDisabled={approval.isPending}
            onPress={() => {
              setScanning(!scanning);
              setNotice('');
            }}
          >
            {t(scanning ? 'stopScan' : 'scan')}
          </Button>
          {scanning && (
            <Scanner
              onScan={(results) => {
                const parsed = parseEnrollmentQr(results[0]?.rawValue ?? '', type);
                if (!parsed) {
                  setNotice('invalidScan');
                  return;
                }
                setCode(parsed);
                setScanning(false);
                setNotice('');
              }}
              onError={() => {
                setScanning(false);
                setNotice('camera');
              }}
            />
          )}
          {notice && (
            <Alert status={notice === 'success' ? 'success' : 'warning'}>
              <AlertContent>
                <AlertDescription>{t(`states.${notice}`)}</AlertDescription>
              </AlertContent>
            </Alert>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="ghost"
            isDisabled={approval.isPending}
            onPress={() => {
              setOpen(false);
              setScanning(false);
            }}
          >
            {t('close')}
          </Button>
          <Button
            variant="primary"
            isDisabled={!valid || approval.isPending}
            isPending={approval.isPending}
            onPress={() => approval.mutate(code)}
          >
            {t('approve')}
          </Button>
        </ModalFooter>
      </StandardModal>
    </>
  );
}
