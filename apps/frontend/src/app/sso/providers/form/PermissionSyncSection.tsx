import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Description,
  Label,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
} from '@heroui/react';
import { AlertStatusIcon, LabeledSwitch, useTranslations } from '@attraccess/plugins-frontend-ui';
import { MAX_PERMISSION_SYNC_TTL_MINUTES } from '../formDefaults';
import en from '../en.json';
import de from '../de.json';

const DEFAULT_INTERVAL_MINUTES = 60;
const REQUIREMENTS = ['refreshToken', 'tokenLifetime', 'rejection', 'existingSessions'] as const;

interface PermissionSyncSectionProps {
  /** Minutes between re-syncs; null (or 0) means re-sync is off. */
  value: number | null | undefined;
  onChange: (value: number | null) => void;
}

export function PermissionSyncSection({ value, onChange }: PermissionSyncSectionProps) {
  const { t } = useTranslations({ en, de });
  const enabled = typeof value === 'number' && value > 0;

  return (
    <section
      className="w-full flex flex-col gap-4 pt-6 border-t border-default-200"
      data-cy="sso-provider-form-oidc-permission-sync-section"
    >
      <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
        {t('sections.oidcPermissionSync')}
      </h3>
      <p className="text-sm text-default-500">{t('permissionSync.description')}</p>

      <LabeledSwitch
        isSelected={enabled}
        onChange={(on) => onChange(on ? DEFAULT_INTERVAL_MINUTES : null)}
        data-cy="sso-provider-form-oidc-permission-sync-toggle"
      >
        <span className="text-sm">{t('permissionSync.enable')}</span>
      </LabeledSwitch>

      {enabled && (
        <NumberField
          minValue={1}
          maxValue={MAX_PERMISSION_SYNC_TTL_MINUTES}
          value={value}
          onChange={(next) => onChange(Number.isNaN(next) || next <= 0 ? null : next)}
        >
          <Label>{t('permissionSyncTtlMinutes')}</Label>
          <NumberFieldGroup>
            <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
            <NumberFieldInput data-cy="sso-provider-form-oidc-permission-sync-ttl-input" />
            <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
          </NumberFieldGroup>
          <Description>{t('permissionSyncTtlMinutesHint')}</Description>
        </NumberField>
      )}

      <Alert status="warning" data-cy="sso-provider-form-oidc-permission-sync-requirements">
        <AlertStatusIcon status="warning" />
        <AlertContent>
          <AlertTitle>{t('permissionSync.requirements.title')}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 flex flex-col gap-1">
              {REQUIREMENTS.map((key) => (
                <li key={key}>{t(`permissionSync.requirements.${key}`)}</li>
              ))}
            </ul>
          </AlertDescription>
        </AlertContent>
      </Alert>
    </section>
  );
}
