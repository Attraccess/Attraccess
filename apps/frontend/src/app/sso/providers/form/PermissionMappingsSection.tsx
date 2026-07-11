import { Input, Label, Spinner, TextField } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useRbacServiceListRoles } from '@attraccess/react-query-client';
import en from '../en.json';
import de from '../de.json';

interface PermissionMappingsSectionProps {
  variant: 'oidc' | 'saml';
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export const PermissionMappingsSection = ({ variant, values, onChange }: PermissionMappingsSectionProps) => {
  const { t } = useTranslations({ en, de });
  const { data: roles, isLoading } = useRbacServiceListRoles();

  return (
    <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
      <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('permissionMappings')}</h3>
      <p className="text-xs text-default-500">{t('permissionMappingsHint')}</p>
      {isLoading ? (
        <div className="flex justify-center p-4">
          <Spinner size="sm" />
        </div>
      ) : (
        (roles ?? []).map((role) => (
          <TextField
            key={`${variant}-permission-${role.key}`}
            value={values[role.key] ?? ''}
            onChange={(v) => onChange(role.key, v)}
          >
            <Label>{role.name}</Label>
            <Input
              placeholder={t('permissionMappingsPlaceholder')}
              data-cy={`sso-provider-form-${variant}-permission-mapping-${role.key}`}
            />
          </TextField>
        ))
      )}
    </section>
  );
};
