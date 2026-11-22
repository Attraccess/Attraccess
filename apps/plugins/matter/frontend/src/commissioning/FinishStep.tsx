import { Button, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Description, Input, Label, TextField } from '@heroui/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAX_NAME_LENGTH } from '../devices/ClaimDialog';
import { errorMessage } from '../errorMessage';
import { useMatterTranslations } from '../i18n';
import { matterDevicePath } from '../matterPaths';
import { finishSession, type CommissioningSessionView } from './api';

/**
 * Step 4: the device is in the fabric and already claimed by you. Name it (device, location, endpoints), or skip: the
 * device stays as it is. `onDone` runs when the page should return to the start of the flow.
 */
export function FinishStep({ session, onDone }: Readonly<{ session: CommissioningSessionView; onDone: () => void }>) {
  const { t } = useMatterTranslations();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [endpointNames, setEndpointNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const tooLong = [name, location, ...Object.values(endpointNames)].some(
    (value) => value.trim().length > MAX_NAME_LENGTH,
  );

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
      setError(errorMessage(failure));
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

  if (saved || session.finished) {
    return (
      <div className="mt:flex mt:flex-col mt:gap-3" data-cy="matter-finish-done">
        <StatusAlert status="success" title={t('commissioning.finish.doneTitle')}>
          {t('commissioning.finish.doneText')}
        </StatusAlert>
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
    <div className="mt:flex mt:flex-col mt:gap-4" data-cy="matter-finish-step">
      <StatusAlert status="success" title={t('commissioning.finish.addedTitle')}>
        {t('commissioning.finish.addedText')}
        {session.attestation?.status === 'overridden' && (
          <span className="mt:mt-1 mt:block" data-cy="matter-finish-overridden">
            {t('commissioning.finish.overridden')}
          </span>
        )}
      </StatusAlert>
      <h3 className="mt:text-lg mt:font-semibold">{t('commissioning.finish.title')}</h3>
      <TextField value={name} onChange={setName}>
        <Label>{t('commissioning.finish.name')}</Label>
        <Input autoComplete="off" data-cy="matter-finish-name" />
      </TextField>
      <TextField value={location} onChange={setLocation}>
        <Label>{t('commissioning.finish.location')}</Label>
        <Input autoComplete="off" data-cy="matter-finish-location" />
      </TextField>
      {session.endpoints.length > 0 && (
        <fieldset className="mt:flex mt:flex-col mt:gap-3" data-cy="matter-finish-endpoints">
          <legend className="mt:font-medium">{t('commissioning.finish.endpoints')}</legend>
          {session.endpoints.map((endpoint) => (
            <TextField
              key={endpoint.id}
              value={endpointNames[endpoint.id] ?? endpoint.displayName ?? ''}
              onChange={(value) => setEndpointNames((previous) => ({ ...previous, [endpoint.id]: value }))}
            >
              <Label>{t('commissioning.finish.endpoint', { endpointId: endpoint.endpointId })}</Label>
              <Input autoComplete="off" data-cy={`matter-finish-endpoint-${endpoint.endpointId}`} />
            </TextField>
          ))}
          <Description>{t('commissioning.finish.endpointsHint')}</Description>
        </fieldset>
      )}
      {tooLong && <p className="mt:text-sm mt:text-danger">{t('devices.validation.nameLength')}</p>}
      {error && (
        <StatusAlert status="danger" title={t('commissioning.finish.failed')} data-cy="matter-finish-error">
          {error}
        </StatusAlert>
      )}
      <div className="mt:flex mt:flex-wrap mt:gap-2">
        <Button
          variant="primary"
          isPending={busy}
          isDisabled={tooLong}
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
