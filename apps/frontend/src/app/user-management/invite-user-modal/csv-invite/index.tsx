import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { useCallback, useState } from 'react';
import {
  CsvInviteUploadDto,
  useUsersServiceInviteUsersFromCsv,
  ApiError,
  useUsersServiceFindManyKey,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import type { CsvRowError } from './csvRowErrors';
import { useCsvPreview } from './useCsvPreview';
import { CsvColumnMapping, CsvFieldMapping } from './CsvFieldMapping';
import { CsvPreviewTable } from './CsvPreviewTable';
import { CsvRowErrorsTable } from './CsvRowErrorsTable';

export interface Props {
  onSuccess?: () => void;
  onError?: (error: ApiError) => void;
}

function pickCsvFile(onPicked: (file: File | null) => void) {
  const file = document.createElement('input') as HTMLInputElement;
  file.type = 'file';
  file.accept = '.csv';
  file.onchange = (e) => onPicked((e.target as HTMLInputElement).files?.[0] || null);
  file.click();
}

export function CsvInvite({ onSuccess, onError }: Readonly<Props>) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { csvHeaders, previewRows } = useCsvPreview(selectedFile);
  const [mapping, setMapping] = useState<CsvColumnMapping>({});
  const [rowErrors, setRowErrors] = useState<CsvRowError[]>([]);
  const [ignoredRows, setIgnoredRows] = useState<number[]>([]);

  const { mutate: inviteUsers, isPending } = useUsersServiceInviteUsersFromCsv({
    onSuccess: () => {
      setRowErrors([]);
      setIgnoredRows([]);
      toast.success({
        title: t('success.title'),
        description: t('success.description'),
      });
      queryClient.invalidateQueries({
        queryKey: [useUsersServiceFindManyKey],
      });
      onSuccess?.();
    },
    onError: (error) => {
      const apiError = error as ApiError;
      const body = apiError?.body as { errors?: CsvRowError[] };
      setRowErrors(body?.errors ?? []);
      onError?.(apiError);
    },
  });

  const submit = useCallback(
    (options?: { ignoreFailed?: boolean }) => {
      const { emailKey, usernameKey, roleKeyColumn } = mapping;
      if (!selectedFile || !emailKey || !usernameKey) {
        toast.error({
          title: t('errors.missingConfig.title'),
          description: t('errors.missingConfig.description'),
        });
        return;
      }

      const rowsToIgnore = options?.ignoreFailed
        ? Array.from(new Set([...ignoredRows, ...rowErrors.map((e) => e.row)]))
        : ignoredRows;

      if (options?.ignoreFailed) {
        setIgnoredRows(rowsToIgnore);
      }

      const formData: CsvInviteUploadDto = {
        file: selectedFile,
        config: {
          emailKey,
          usernameKey,
          ignoredRows: rowsToIgnore,
          ...(roleKeyColumn ? { roleKeyColumn } : {}),
        },
      };

      inviteUsers({
        formData,
      });
    },
    [ignoredRows, inviteUsers, mapping, rowErrors, selectedFile, t, toast],
  );

  return (
    <div className="flex flex-col gap-4">
      <Button variant="secondary" onPress={() => pickCsvFile(setSelectedFile)}>
        {selectedFile ? selectedFile.name : t('inputs.file')}
      </Button>

      <CsvFieldMapping
        csvHeaders={csvHeaders}
        mapping={mapping}
        onChange={(change) => setMapping((previous) => ({ ...previous, ...change }))}
      />

      <CsvPreviewTable
        csvHeaders={csvHeaders}
        previewRows={previewRows}
        usernameKey={mapping.usernameKey}
        emailKey={mapping.emailKey}
      />

      {rowErrors.length > 0 && <CsvRowErrorsTable rowErrors={rowErrors} />}

      <div className="flex justify-end w-full gap-2">
        {rowErrors.length > 0 && (
          <Button variant="secondary" onPress={() => submit({ ignoreFailed: true })} isPending={isPending}>
            {t('actions.inviteIgnore')}
          </Button>
        )}
        <Button variant="primary" onPress={() => submit()} isPending={isPending}>
          {t('actions.invite')}
        </Button>
      </div>
    </div>
  );
}
