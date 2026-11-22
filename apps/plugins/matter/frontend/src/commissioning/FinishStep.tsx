import { Button, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Description, FieldError, Input, Label, TextField } from '@heroui/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAX_NAME_LENGTH } from '../devices/ClaimDialog';
import { useMatterTranslations } from '../i18n';
import { matterDevicePath } from '../matterPaths';
import { useMatterErrorText } from '../useMatterErrorText';
import { finishSession, type CommissioningSessionView } from './api';
import { StepHeading } from './StepHeading';
import { useFocusOnChange } from './useFocusOnChange';

const tooLong = (value: string) => value.trim().length > MAX_NAME_LENGTH;

/**
 * Step 4: the device is in the fabric and already claimed by you. Name it (device, location, endpoints), or skip: the
 * device stays as it is. `onDone` runs when the page should return to the start of the flow.
 */
export function FinishStep({ session, onDone }: Readonly<{ session: CommissioningSessionView; onDone: () => void }>) {
  const { t } = useMatterTranslations();
  const errorText = useMatterErrorText();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [endpointNames, setEndpointNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const invalid = [name, location, ...Object.values(endpointNames)].some(tooLong);
  const done = saved || session.finished;
  const container = useFocusOnChange<HTMLDivElement>(done ? 'done' : 'naming');

  const finish = async (withNames: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const endpoints = Object.entries(endpointNames)
        .filter(([, value]) => value.trim() !== '')
        .map(([id, value]) => ({ id, displayName: value.trim() }));
      await finishSession(
        session.id,
        withNames
          ? {
              ...(name.trim() ? { displayName: name.trim() } : {}),
              ...(location.trim() ? { location: location.trim() } : {}),
              ...(endpoints.length ? { endpoints } : {}),
            }
          : {},
      );
      setSaved(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  const deviceLink = session.nodeRecordId ? (
    <Button
      variant="primary"
      onPress={() => navigate(matterDevicePath(session.nodeRecordId as string))}
      data-cy="matter-finish-open-device"
    >
      {t('commissioning.finish.openDevice')}
    </Button>
  ) : null;

  if (done) {
    return (
      <div ref={container} className="mt:flex mt:flex-col mt:gap-3" data-cy="matter-finish-done">
        <StepHeading>{t('commissioning.finish.doneTitle')}</StepHeading>
        <StatusAlert status="success">{t('commissioning.finish.doneText')}</StatusAlert>
        <div className="mt:flex mt:flex-wrap mt:gap-2">
          {deviceLink}
          <Button variant="secondary" onPress={onDone} data-cy="matter-finish-another">
            {t('commissioning.finish.another')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={container} className="mt:flex mt:flex-col mt:gap-4" data-cy="matter-finish-step">
      <StepHeading>{t('commissioning.finish.title')}</StepHeading>
      <StatusAlert status="success" title={t('commissioning.finish.addedTitle')}>
        {t('commissioning.finish.addedText')}
        {session.attestation?.status === 'overridden' && (
          <span className="mt:mt-1 mt:block" data-cy="matter-finish-overridden">
            {t('commissioning.finish.overridden')}
          </span>
        )}
      </StatusAlert>
      <TextField value={name} onChange={setName} isInvalid={tooLong(name)}>
        <Label>{t('commissioning.finish.name')}</Label>
        <Input autoComplete="off" data-cy="matter-finish-name" />
        <FieldError data-cy="matter-finish-name-error">{t('devices.validation.nameLength')}</FieldError>
      </TextField>
      <TextField value={location} onChange={setLocation} isInvalid={tooLong(location)}>
        <Label>{t('commissioning.finish.location')}</Label>
        <Input autoComplete="off" data-cy="matter-finish-location" />
        <FieldError data-cy="matter-finish-location-error">{t('devices.validation.nameLength')}</FieldError>
      </TextField>
      {session.endpoints.length > 0 && (
        <fieldset className="mt:flex mt:flex-col mt:gap-3" data-cy="matter-finish-endpoints">
          <legend className="mt:font-medium">{t('commissioning.finish.endpoints')}</legend>
          {session.endpoints.map((endpoint) => {
            const value = endpointNames[endpoint.id] ?? endpoint.displayName ?? '';
            return (
              <TextField
                key={endpoint.id}
                value={value}
                onChange={(next) => setEndpointNames((previous) => ({ ...previous, [endpoint.id]: next }))}
                isInvalid={tooLong(value)}
              >
                <Label>{t('devices.endpoint.number', { number: endpoint.endpointId })}</Label>
                <Input autoComplete="off" data-cy={`matter-finish-endpoint-${endpoint.endpointId}`} />
                <FieldError data-cy={`matter-finish-endpoint-${endpoint.endpointId}-error`}>
                  {t('devices.validation.nameLength')}
                </FieldError>
              </TextField>
            );
          })}
          <Description>{t('commissioning.finish.endpointsHint')}</Description>
        </fieldset>
      )}
      {error !== null && (
        <StatusAlert status="danger" title={t('commissioning.finish.failed')} data-cy="matter-finish-error">
          {errorText(error)}
        </StatusAlert>
      )}
      <div className="mt:flex mt:flex-wrap mt:gap-2">
        <Button
          variant="primary"
          isPending={busy}
          isDisabled={invalid}
          onPress={() => void finish(true)}
          data-cy="matter-finish-save"
        >
          {t('commissioning.finish.save')}
        </Button>
        <Button variant="tertiary" isDisabled={busy} onPress={() => void finish(false)} data-cy="matter-finish-skip">
          {t('commissioning.finish.skip')}
        </Button>
        {deviceLink}
      </div>
    </div>
  );
}
