import { Input, Label, TextField } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PermissionKey, permissionKeys } from '../formDefaults';
import en from '../en.json';
import de from '../de.json';

interface PermissionMappingsSectionProps {
  variant: 'oidc' | 'saml';
  values: Record<PermissionKey, string>;
  onChange: (key: PermissionKey, value: string) => void;
}

export const PermissionMappingsSection = ({ variant, values, onChange }: PermissionMappingsSectionProps) => {
  const { t } = useTranslations({ en, de });

  return (
    <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
      <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('permissionMappings')}</h3>
      <p className="text-xs text-default-500">{t('permissionMappingsHint')}</p>
      {permissionKeys.map((permissionKey) => (
        <TextField
          key={`${variant}-permission-${permissionKey}`}
          value={values[permissionKey]}
          onChange={(v) => onChange(permissionKey, v)}
        >
          <Label>{t(`permissionMappingLabels.${permissionKey}`)}</Label>
          <Input
            placeholder={t('permissionMappingsPlaceholder')}
            data-cy={`sso-provider-form-${variant}-permission-mapping-${permissionKey}`}
          />
        </TextField>
      ))}
    </section>
  );
};
