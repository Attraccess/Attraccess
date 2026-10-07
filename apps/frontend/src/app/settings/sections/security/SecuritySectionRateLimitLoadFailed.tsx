import {
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
} from '@heroui/react';
import { SettingsRow } from '../../components/SettingsRow';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { RATE_LIMIT_NUMBERS } from './index.state';
import { useSecuritySectionState } from './useSecuritySectionState';
type Props = Pick<
  ReturnType<typeof useSecuritySectionState>,
  'rateLimit' | 'loadFailed' | 't' | 'rateValue' | 'setRateDraft' | 'exponentialBackoff'
>;
export function SecuritySectionRateLimitLoadFailed({
  rateLimit,
  loadFailed,
  t,
  rateValue,
  setRateDraft,
  exponentialBackoff,
}: Props) {
  return (
    <div className="flex flex-col">
      {!rateLimit ? (
        // Settled with nothing usable. The other three groups are separate queries and stay
        // editable — only throttling is unreachable.
        <div data-testid="rate-limit-load-failed">{loadFailed(t('rateLimit.loadFailed'))}</div>
      ) : (
        <>
          {RATE_LIMIT_NUMBERS.map((key) => (
            <SettingsRow
              key={key}
              label={t(`rateLimit.fields.${key}.label`)}
              hint={t(`rateLimit.fields.${key}.description`)}
            >
              <NumberField
                aria-label={t(`rateLimit.fields.${key}.label`)}
                value={rateValue(key)}
                minValue={1}
                onChange={(next) => setRateDraft((current) => ({ ...current, [key]: next }))}
              >
                <NumberFieldGroup>
                  <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
                  <NumberFieldInput />
                  <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
                </NumberFieldGroup>
              </NumberField>
            </SettingsRow>
          ))}

          <SettingsRow
            label={t('rateLimit.fields.exponentialBackoff.label')}
            hint={t('rateLimit.fields.exponentialBackoff.description')}
          >
            <LabeledSwitch
              aria-label={t('rateLimit.fields.exponentialBackoff.label')}
              isSelected={exponentialBackoff}
              onChange={(next) => setRateDraft((current) => ({ ...current, exponentialBackoff: next }))}
            />
          </SettingsRow>

          <SettingsRow
            label={t('rateLimit.fields.backoffMultiplier.label')}
            hint={t('rateLimit.fields.backoffMultiplier.description')}
          >
            <NumberField
              aria-label={t('rateLimit.fields.backoffMultiplier.label')}
              value={rateValue('backoffMultiplier')}
              minValue={1}
              step={0.1}
              isDisabled={!exponentialBackoff}
              onChange={(next) => setRateDraft((current) => ({ ...current, backoffMultiplier: next }))}
            >
              <NumberFieldGroup>
                <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
                <NumberFieldInput />
                <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
              </NumberFieldGroup>
            </NumberField>
          </SettingsRow>
        </>
      )}
    </div>
  );
}
