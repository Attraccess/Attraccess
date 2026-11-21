import { useListRoles } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Select } from '../../../../components/select/index';
import en from './en.json';
import de from './de.json';

/** Which CSV columns hold the email, the username and (optionally) the first name, last name and role key. */
export interface CsvColumnMapping {
  emailKey?: string;
  usernameKey?: string;
  firstNameKey?: string;
  lastNameKey?: string;
  roleKeyColumn?: string;
}

interface CsvFieldMappingProps {
  csvHeaders: string[];
  mapping: CsvColumnMapping;
  onChange: (change: Partial<CsvColumnMapping>) => void;
}

export function CsvFieldMapping({ csvHeaders, mapping, onChange }: Readonly<CsvFieldMappingProps>) {
  const { t } = useTranslations({ en, de });
  const { data: availableRoles } = useListRoles();
  const headerItems = csvHeaders.map((header) => ({ label: header, key: header }));

  return (
    <>
      <Select
        label={t('inputs.fieldMapping.email')}
        value={mapping.emailKey ?? ''}
        onChange={(emailKey) => onChange({ emailKey })}
        items={headerItems}
        isRequired
      />

      <Select
        label={t('inputs.fieldMapping.username')}
        value={mapping.usernameKey ?? ''}
        onChange={(usernameKey) => onChange({ usernameKey })}
        items={headerItems}
        isRequired
      />

      {csvHeaders.length > 0 && (
        <>
          <Select
            label={t('inputs.fieldMapping.firstName')}
            value={mapping.firstNameKey ?? ''}
            onChange={(v) => onChange({ firstNameKey: v || undefined })}
            items={[{ label: '—', key: '' }, ...headerItems]}
          />
          <Select
            label={t('inputs.fieldMapping.lastName')}
            value={mapping.lastNameKey ?? ''}
            onChange={(v) => onChange({ lastNameKey: v || undefined })}
            items={[{ label: '—', key: '' }, ...headerItems]}
          />
        </>
      )}

      {csvHeaders.length > 0 && (availableRoles ?? []).length > 0 && (
        <Select
          label={t('inputs.fieldMapping.roleKeyColumn')}
          value={mapping.roleKeyColumn ?? ''}
          onChange={(v) => onChange({ roleKeyColumn: v || undefined })}
          items={[{ label: '—', key: '' }, ...headerItems]}
        />
      )}
    </>
  );
}
