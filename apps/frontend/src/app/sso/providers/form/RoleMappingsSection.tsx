import { Input, Label, Spinner, TextField } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Role } from '@attraccess/react-query-client';
import en from '../en.json';
import de from '../de.json';

interface RoleMappingsSectionProps {
  variant: 'oidc' | 'saml';
  roles: Role[] | undefined;
  isLoadingRoles: boolean;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export const RoleMappingsSection = ({ variant, roles, isLoadingRoles, values, onChange }: RoleMappingsSectionProps) => {
  const { t } = useTranslations({ en, de });

  return (
    <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
      <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('roleMappings')}</h3>
      <p className="text-xs text-default-500">{t('roleMappingsHint')}</p>
      {isLoadingRoles && <Spinner size="sm" />}
      {(roles ?? []).map((role) => (
        <TextField
          key={`${variant}-role-${role.key}`}
          value={values[role.key] ?? ''}
          onChange={(v) => onChange(role.key, v)}
        >
          <Label>{role.name ?? role.key}</Label>
          <Input
            placeholder={t('roleMappingsPlaceholder')}
            data-cy={`sso-provider-form-${variant}-role-mapping-${role.key}`}
          />
        </TextField>
      ))}
    </section>
  );
};
