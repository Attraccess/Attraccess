import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { readPreviewFromFile as readPreview } from './csv-preview';
import {
  CsvInviteUploadDto,
  useUsersServiceInviteUsersFromCsv,
  ApiError,
  useRbacServiceListRoles,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { useUsersServiceFindManyKey } from '@attraccess/react-query-client';
import { PREVIEW_ROW_COUNT } from './index.preview-row-count';
import { CsvRowError } from './index.contracts';
import { Props } from './index.contracts';
export function useCsvInviteState({ onSuccess, onError }: Props) {
  const readPreviewFromFile = readPreview;
  const { t } = useTranslations({
    en,
    de,
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);

  const [emailKey, setEmailKey] = useState<string | undefined>(undefined);
  const [usernameKey, setUsernameKey] = useState<string | undefined>(undefined);
  const [roleKeyColumn, setRoleKeyColumn] = useState<string | undefined>(undefined);

  const { data: availableRoles } = useRbacServiceListRoles();

  const selectFile = useCallback(() => {
    const file = document.createElement('input') as HTMLInputElement;
    file.type = 'file';
    file.accept = '.csv';
    file.onchange = (e) => setSelectedFile((e.target as HTMLInputElement).files?.[0] || null);
    file.click();
  }, [setSelectedFile]);

  useEffect(() => {
    if (!selectedFile) {
      setCsvHeaders([]);
      setPreviewRows([]);
      return;
    }

    let cancelled = false;

    const loadPreview = async () => {
      try {
        const rows = await readPreviewFromFile(selectedFile, PREVIEW_ROW_COUNT);
        if (cancelled) return;

        const [headerRow = [], ...dataRows] = rows;
        setCsvHeaders(headerRow);
        setPreviewRows(dataRows);
      } catch {
        if (cancelled) return;
        setCsvHeaders([]);
        setPreviewRows([]);
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
    };
  }, [selectedFile, readPreviewFromFile]);

  const previewUsers = useMemo(() => {
    if (!csvHeaders.length && !previewRows.length) return [];

    return previewRows.slice(0, PREVIEW_ROW_COUNT).map((columns, index) => {
      const data: Record<string, string> = {};

      csvHeaders.forEach((header, headerIndex) => {
        const column = columns[headerIndex] ?? '';
        data[header] = column;
      });

      return {
        index: index + 1,
        username: data[usernameKey ?? ''] ?? '',
        email: data[emailKey ?? ''] ?? '',
      };
    });
  }, [csvHeaders, previewRows, usernameKey, emailKey]);

  const [rowErrors, setRowErrors] = useState<CsvRowError[]>([]);
  const [ignoredRows, setIgnoredRows] = useState<number[]>([]);

  const buildConfig = useCallback(
    (rowsToIgnore?: number[]) => ({
      emailKey: emailKey ?? '',
      usernameKey: usernameKey ?? '',
      ignoredRows: rowsToIgnore ?? ignoredRows,
      ...(roleKeyColumn ? { roleKeyColumn } : {}),
    }),
    [emailKey, usernameKey, ignoredRows, roleKeyColumn],
  );

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
      const body = (apiError as ApiError)?.body as { errors?: CsvRowError[] };
      setRowErrors(body?.errors ?? []);
      onError?.(apiError);
    },
  });

  const validateReady = useCallback(
    () => Boolean(selectedFile && emailKey && usernameKey),
    [emailKey, selectedFile, usernameKey],
  );

  const submit = useCallback(
    (options?: { ignoreFailed?: boolean }) => {
      if (!validateReady()) {
        toast.error({
          title: t('errors.missingConfig.title'),
          description: t('errors.missingConfig.description'),
        });
        return;
      }

      const rowsToIgnore = options?.ignoreFailed
        ? Array.from(new Set([...(ignoredRows ?? []), ...rowErrors.map((e) => e.row)]))
        : ignoredRows;

      if (options?.ignoreFailed) {
        setIgnoredRows(rowsToIgnore);
      }

      const formData: CsvInviteUploadDto = {
        file: selectedFile as File,
        config: buildConfig(rowsToIgnore),
      };

      inviteUsers({
        formData,
      });
    },
    [buildConfig, ignoredRows, inviteUsers, rowErrors, selectedFile, t, toast, validateReady],
  );
  return {
    t,
    selectedFile,
    csvHeaders,
    emailKey,
    setEmailKey,
    usernameKey,
    setUsernameKey,
    roleKeyColumn,
    setRoleKeyColumn,
    availableRoles,
    selectFile,
    previewUsers,
    rowErrors,
    isPending,
    submit,
  } as const;
}
