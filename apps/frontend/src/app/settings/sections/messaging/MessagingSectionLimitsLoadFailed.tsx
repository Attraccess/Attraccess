import {
  Alert,
  AlertContent,
  AlertDescription,
  InputGroup,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
  TextField,
} from '@heroui/react';
import { RefreshCwIcon } from 'lucide-react';
import { AlertStatusIcon } from '../../../../components/AlertStatusIcon';
import { SettingsRow } from '../../components/SettingsRow';
import { Button } from '../../../../components/button';
import { LIMIT_KEYS } from './index.limit-keys';
import { useMessagingSectionState } from './useMessagingSectionState';
type Props = Pick<
  ReturnType<typeof useMessagingSectionState>,
  | 'areLimitsReady'
  | 't'
  | 'valueOf'
  | 'setDraft'
  | 'setPendingOverride'
  | 'setConfirmStep'
  | 'customPublicKey'
  | 'setCustomPublicKey'
  | 'customPrivateKey'
  | 'setCustomPrivateKey'
>;
export function MessagingSectionLimitsLoadFailed({
  areLimitsReady,
  t,
  valueOf,
  setDraft,
  setPendingOverride,
  setConfirmStep,
  customPublicKey,
  setCustomPublicKey,
  customPrivateKey,
  setCustomPrivateKey,
}: Props) {
  return (
    <div className="flex flex-col">
      {!areLimitsReady ? (
        // The limits are unknown, not zero. The VAPID controls below are a separate query and
        // stay usable, so this replaces only the four rows it actually covers.
        <Alert status="danger" data-testid="messaging-limits-load-failed">
          <AlertStatusIcon status="danger" />
          <AlertContent>
            <AlertDescription>{t('limits.loadFailed')}</AlertDescription>
          </AlertContent>
        </Alert>
      ) : (
        LIMIT_KEYS.map((key) => (
          <SettingsRow
            key={key}
            data-testid={`messaging-limit-row-${key}`}
            label={t(`fields.${key}.label`)}
            hint={t(`fields.${key}.description`)}
          >
            <NumberField
              aria-label={t(`fields.${key}.label`)}
              value={valueOf(key)}
              minValue={1}
              onChange={(next) => setDraft((current) => ({ ...current, [key]: next }))}
            >
              <NumberFieldGroup>
                <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
                <NumberFieldInput />
                <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
              </NumberFieldGroup>
            </NumberField>
          </SettingsRow>
        ))
      )}

      <SettingsRow label={t('push.regenerateLabel')} hint={t('push.regenerateHint')}>
        <Button
          variant="tertiary"
          size="sm"
          onPress={() => {
            setPendingOverride(undefined);
            setConfirmStep('warning');
          }}
        >
          <RefreshCwIcon size={16} />
          {t('regenerateButton')}
        </Button>
      </SettingsRow>

      <SettingsRow stacked label={t('overrideTitle')} hint={t('overrideDescription')}>
        <div className="flex w-full flex-col gap-2">
          <TextField value={customPublicKey} onChange={setCustomPublicKey} aria-label={t('publicKeyInputLabel')}>
            <InputGroup>
              <InputGroup.Input className="font-mono text-sm" placeholder={t('publicKeyInputLabel')} />
            </InputGroup>
          </TextField>
          <TextField value={customPrivateKey} onChange={setCustomPrivateKey} aria-label={t('privateKeyInputLabel')}>
            <InputGroup>
              <InputGroup.Input className="font-mono text-sm" type="password" placeholder={t('privateKeyInputLabel')} />
            </InputGroup>
          </TextField>
          <div className="flex">
            <Button
              variant="secondary"
              size="sm"
              isDisabled={!customPublicKey.trim() || !customPrivateKey.trim()}
              onPress={() => {
                setPendingOverride({ publicKey: customPublicKey.trim(), privateKey: customPrivateKey.trim() });
                setConfirmStep('warning');
              }}
            >
              {t('applyCustomButton')}
            </Button>
          </div>
        </div>
      </SettingsRow>
    </div>
  );
}
