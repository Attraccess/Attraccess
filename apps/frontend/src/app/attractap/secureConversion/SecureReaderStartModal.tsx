import { Input, Label, ModalBody, ModalFooter, ModalHeader, ModalHeading, TextField } from '@heroui/react';
import { Button, StandardModal, StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useRunSecureConversionPreflight,
  useStartSecureConversion,
  type Attractap,
} from '@attraccess/react-query-client';
import { useState } from 'react';
import { conversionErrorText } from './conversionErrorText';
import { PreflightList } from './PreflightList';
import de from './de.json';
import en from './en.json';

interface Props {
  isOpen: boolean;
  reader: Pick<Attractap, 'id' | 'name'>;
  onClose: () => void;
  onStarted: () => void;
}

/**
 * Typed name, read-only preflight and a separate Start: nothing is written on the reader before Start, and the
 * server checks every gate again.
 */
export function SecureReaderStartModal({ isOpen, reader, onClose, onStarted }: Readonly<Props>) {
  const { t } = useTranslations({ de, en });
  const [typedName, setTypedName] = useState('');
  const nameMatches = typedName.trim() === reader.name.trim();
  const preflight = useRunSecureConversionPreflight();
  const start = useStartSecureConversion(undefined, { onSuccess: onStarted });
  const result = preflight.data;
  const error = start.error ?? preflight.error;

  return (
    <StandardModal isOpen={isOpen} onOpenChange={(open) => !open && onClose()} data-cy="secure-conversion-start">
      {({ close }) => (
        <>
          <ModalHeader>
            <ModalHeading>{t('start.title', { name: reader.name })}</ModalHeading>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <TextField
              value={typedName}
              onChange={setTypedName}
              isInvalid={typedName !== '' && !nameMatches}
              data-cy="secure-conversion-name"
            >
              <Label>{t('start.typeName')}</Label>
              <Input placeholder={reader.name} autoComplete="off" />
            </TextField>
            <p className="text-sm text-muted">{t('start.preflightHint')}</p>
            <Button
              variant="secondary"
              isDisabled={!nameMatches}
              isPending={preflight.isPending}
              onPress={() => preflight.mutate({ path: { id: reader.id } })}
              data-cy="secure-conversion-run-preflight"
            >
              {t('start.runPreflight')}
            </Button>
            {result && (
              <>
                <PreflightList checks={result.checks} />
                <StatusAlert status={result.ok ? 'success' : 'danger'} data-cy="secure-conversion-preflight-result">
                  {result.ok ? t('start.preflightPassed') : t('start.preflightFailed')}
                </StatusAlert>
              </>
            )}
            {error ? (
              <StatusAlert status="danger" title={t('start.failed')} data-cy="secure-conversion-start-error">
                {conversionErrorText(error, t)}
              </StatusAlert>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={close} isDisabled={start.isPending}>
              {t('start.cancel')}
            </Button>
            <Button
              isDisabled={!nameMatches || !result?.ok}
              isPending={start.isPending}
              onPress={() => start.mutate({ path: { id: reader.id }, body: { confirmName: typedName } })}
              data-cy="secure-conversion-start-button"
            >
              {t('start.start')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
