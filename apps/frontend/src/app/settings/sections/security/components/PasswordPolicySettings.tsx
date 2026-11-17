import {
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
} from '@heroui/react';
import { LabeledSwitch, StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import { PasswordPolicyDto, PasswordPolicyOverrideDto } from '@attraccess/react-query-client';
import { SettingsRow } from '../../../components/SettingsRow';
import { POLICY_BOOL_FIELDS, POLICY_NUMBER_FIELDS } from '../policy-fields';
import { policyValue } from '../policyValue';
import { SecurityDrafts } from '../useSecurityDrafts';
import { PasswordPolicyOverrides } from './PasswordPolicyOverrides';
import en from '../en.json';
import de from '../de.json';

interface PasswordPolicySettingsProps extends Pick<SecurityDrafts, 'policyDraft' | 'setPolicyDraft'> {
  /** The stored policy; `undefined` once settled means the request failed. */
  policy: PasswordPolicyDto | undefined;
  overrides: PasswordPolicyOverrideDto[];
}

export function PasswordPolicySettings({
  policy,
  overrides,
  policyDraft,
  setPolicyDraft,
}: PasswordPolicySettingsProps) {
  const { t } = useTranslations({ en, de });

  return (
    <div className="flex flex-col">
      {!policy ? (
        <div data-testid="policy-load-failed">
          <StatusAlert status="danger">{t('policy.loadFailed')}</StatusAlert>
        </div>
      ) : (
        <>
          {POLICY_NUMBER_FIELDS.map(({ key, min, max }) => (
            <SettingsRow
              key={String(key)}
              data-testid={`policy-row-${String(key)}`}
              label={t(`fields.${key}.label`)}
              hint={t(`fields.${key}.description`)}
            >
              <NumberField
                aria-label={t(`fields.${key}.label`)}
                value={policyValue(policy, policyDraft, key) as number}
                minValue={min}
                maxValue={max}
                onChange={(next) => setPolicyDraft((current) => ({ ...current, [key]: next }))}
              >
                <NumberFieldGroup>
                  <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
                  <NumberFieldInput />
                  <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
                </NumberFieldGroup>
              </NumberField>
            </SettingsRow>
          ))}

          {POLICY_BOOL_FIELDS.map((key) => (
            <SettingsRow
              key={String(key)}
              data-testid={`policy-row-${String(key)}`}
              label={t(`fields.${key}.label`)}
              hint={t(`fields.${key}.description`)}
            >
              <LabeledSwitch
                aria-label={t(`fields.${key}.label`)}
                isSelected={policyValue(policy, policyDraft, key) as boolean}
                onChange={(next) => setPolicyDraft((current) => ({ ...current, [key]: next }))}
              />
            </SettingsRow>
          ))}

          <PasswordPolicyOverrides policy={policy} overrides={overrides} />
        </>
      )}
    </div>
  );
}
