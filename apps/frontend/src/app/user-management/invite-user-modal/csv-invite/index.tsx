import {
  Badge,
  Button,
  Chip,
  TextField,
  Label,
  Input,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Select } from '../../../../components/select';
import { parse as parseCsv } from 'csv-parse/browser/esm';
import {
  CsvInviteUploadDto,
  SystemPermissions,
  useUsersServiceInviteUsersFromCsv,
  ApiError,
} from '@attraccess/react-query-client';
import { EmptyState } from '../../../../components/emptyState';
import { useToastMessage } from '../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import { useUsersServiceFindManyKey } from '@attraccess/react-query-client';

const PREVIEW_ROW_COUNT = 5;

type CsvRowError = {
  row: number;
  field?: string;
  message: string;
  value?: string;
};

interface Props {
  onSuccess?: () => void;
  onError?: (error: ApiError) => void;
}

export function CsvInvite({ onSuccess, onError }: Props) {
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

  const [permissions, setPermissions] = useState<
    Record<keyof SystemPermissions, { keyMapping: string; yesValue: string }>
  >({
    canManageResources: { keyMapping: 'canManageResources', yesValue: 'true' },
    canManageSystemConfiguration: { keyMapping: 'canManageSystemConfiguration', yesValue: 'true' },
    canManageUsers: { keyMapping: 'canManageUsers', yesValue: 'true' },
    canManageBilling: { keyMapping: 'canManageBilling', yesValue: 'true' },
  });

  const updatePermissionKeyMapping = useCallback((permission: keyof SystemPermissions, key: string) => {
    setPermissions((prev) => ({
      ...prev,
      [permission]: { ...prev[permission], keyMapping: key },
    }));
  }, []);

  const updatePermissionYesValue = useCallback((permission: keyof SystemPermissions, yesValue: string) => {
    setPermissions((prev) => ({
      ...prev,
      [permission]: { ...prev[permission], yesValue },
    }));
  }, []);

  const selectFile = useCallback(() => {
    const file = document.createElement('input') as HTMLInputElement;
    file.type = 'file';
    file.accept = '.csv';
    file.onchange = (e) => setSelectedFile((e.target as HTMLInputElement).files?.[0] || null);
    file.click();
  }, [setSelectedFile]);

  const readPreviewFromFile = useCallback(async (file: File, recordCount: number) => {
    const fileText = await file.text();

    return await new Promise<string[][]>((resolve, reject) => {
      parseCsv(
        fileText,
        {
          bom: true,
          relax_column_count: true,
          skip_empty_lines: false,
          trim: false,
          to_line: recordCount + 1, // only parse what we need for the preview
        },
        (error, output) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(
            (output ?? []).map((record) =>
              (record as Array<string | number | null | undefined>).map((value) =>
                typeof value === 'string' ? value.replace(/\r$/, '') : `${value ?? ''}`,
              ),
            ),
          );
        },
      );
    });
  }, []);

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

      const user = {
        index: index + 1,
        username: data[usernameKey ?? ''] ?? '',
        email: data[emailKey ?? ''] ?? '',
        permissions: [] as string[],
      };

      Object.entries(permissions).forEach(([permission, mapping]) => {
        const dataValue = data[mapping.keyMapping];
        if (dataValue?.trim() === mapping.yesValue) {
          user.permissions.push(permission);
        }
      });

      return user;
    });
  }, [csvHeaders, previewRows, usernameKey, emailKey, permissions]);

  const [rowErrors, setRowErrors] = useState<CsvRowError[]>([]);
  const [ignoredRows, setIgnoredRows] = useState<number[]>([]);

  const buildConfig = useCallback(
    (rowsToIgnore?: number[]) => ({
      emailKey: emailKey ?? '',
      usernameKey: usernameKey ?? '',
      permissions,
      ignoredRows: rowsToIgnore ?? ignoredRows,
    }),
    [emailKey, usernameKey, permissions, ignoredRows],
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

  return (
    <div className="flex flex-col gap-4">
      <Button variant="secondary" onPress={selectFile}>
        {selectedFile ? selectedFile.name : t('inputs.file')}
      </Button>

      <Select
        label={t('inputs.fieldMapping.email')}
        selectedKey={emailKey ?? ''}
        onSelectionChange={setEmailKey}
        items={csvHeaders.map((header) => ({
          label: header,
          key: header,
        }))}
        isRequired
      />

      <Select
        label={t('inputs.fieldMapping.username')}
        selectedKey={usernameKey ?? ''}
        onSelectionChange={setUsernameKey}
        items={csvHeaders.map((header) => ({
          label: header,
          key: header,
        }))}
        isRequired
      />

      {Object.entries(permissions).map(([permission, mapping]) => (
        <div key={permission} className="flex flex-row gap-2 flex-wrap">
          <Select
            className="flex-1"
            label={t('inputs.fieldMapping.' + permission)}
            selectedKey={mapping.keyMapping}
            onSelectionChange={(key) => updatePermissionKeyMapping(permission as keyof SystemPermissions, key)}
            items={csvHeaders.map((header) => ({
              label: header,
              key: header,
            }))}
          />
          <TextField
            className="flex-1"
            value={mapping.yesValue}
            onChange={(value) => updatePermissionYesValue(permission as keyof SystemPermissions, value)}
          >
            <Label>{t('inputs.yesValue')}</Label>
            <Input />
          </TextField>
        </div>
      ))}

      <Table aria-label="csv-invite-table" data-cy="csv-invite-table">
        <TableHeader>
          <TableColumn>{t('preview.columns.index')}</TableColumn>
          <TableColumn>{t('preview.columns.username')}</TableColumn>
          <TableColumn>{t('preview.columns.email')}</TableColumn>
          <TableColumn>{t('preview.columns.permissions.label')}</TableColumn>
        </TableHeader>
        <TableBody items={previewUsers} renderEmptyState={() => <EmptyState />}>
          {(user) => (
            <TableRow key={user.index} id={user.index}>
              <TableCell>#{user.index}</TableCell>
              <TableCell className="w-full">{user.username}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell className="flex-row flex gap-2 flex-wrap">
                {user.permissions.map((permission) => (
                  <Chip key={permission}>{t('preview.columns.permissions.values.' + permission)}</Chip>
                ))}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {rowErrors.length > 0 && (
        <div className="flex flex-col gap-2 border border-default-200 rounded-medium p-3">
          <div className="flex items-center justify-between">
            <Badge color="danger" variant="soft">
              {t('errors.title')} ({rowErrors.length})
            </Badge>
            <Button variant="ghost" size="sm" onPress={() => submit({ ignoreFailed: true })}>
              {t('actions.inviteIgnore')}
            </Button>
          </div>

          <Table aria-label="csv-invite-errors">
            <TableHeader>
              <TableColumn>{t('errors.columns.row')}</TableColumn>
              <TableColumn>{t('errors.columns.field')}</TableColumn>
              <TableColumn>{t('errors.columns.message')}</TableColumn>
              <TableColumn>{t('errors.columns.value')}</TableColumn>
            </TableHeader>
            <TableBody items={rowErrors}>
              {(error) => (
                <TableRow key={`${error.row}-${error.field ?? 'general'}`}>
                  <TableCell>#{error.row}</TableCell>
                  <TableCell>{error.field ?? '-'}</TableCell>
                  <TableCell>{error.message}</TableCell>
                  <TableCell>{error.value ?? '-'}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

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
