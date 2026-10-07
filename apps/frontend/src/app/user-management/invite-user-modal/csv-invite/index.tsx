import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { Button } from '../../../../components/button';
import { Select } from '../../../../components/select';
import { EmptyState } from '../../../../components/emptyState';
import { Props } from './index.contracts';
import { useCsvInviteState } from './useCsvInviteState';

export function CsvInvite({ onSuccess, onError }: Props) {
  const {
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
  } = useCsvInviteState({ onSuccess, onError });

  return (
    <div className="flex flex-col gap-4">
      <Button variant="secondary" onPress={selectFile}>
        {selectedFile ? selectedFile.name : t('inputs.file')}
      </Button>

      <Select
        label={t('inputs.fieldMapping.email')}
        value={emailKey ?? ''}
        onChange={setEmailKey}
        items={csvHeaders.map((header) => ({
          label: header,
          key: header,
        }))}
        isRequired
      />

      <Select
        label={t('inputs.fieldMapping.username')}
        value={usernameKey ?? ''}
        onChange={setUsernameKey}
        items={csvHeaders.map((header) => ({
          label: header,
          key: header,
        }))}
        isRequired
      />

      {csvHeaders.length > 0 && (availableRoles ?? []).length > 0 && (
        <Select
          label={t('inputs.fieldMapping.roleKeyColumn')}
          value={roleKeyColumn ?? ''}
          onChange={(v) => setRoleKeyColumn(v || undefined)}
          items={[{ label: '—', key: '' }, ...csvHeaders.map((header) => ({ label: header, key: header }))]}
        />
      )}

      <Table data-cy="csv-invite-table">
        <TableScrollContainer>
          <TableContent aria-label="csv-invite-table">
            <TableHeader>
              <TableColumn isRowHeader>{t('preview.columns.index')}</TableColumn>
              <TableColumn>{t('preview.columns.username')}</TableColumn>
              <TableColumn>{t('preview.columns.email')}</TableColumn>
            </TableHeader>
            <TableBody items={previewUsers} renderEmptyState={() => <EmptyState />}>
              {(user) => (
                <TableRow key={user.index} id={user.index}>
                  <TableCell>#{user.index}</TableCell>
                  <TableCell className="w-full">{user.username}</TableCell>
                  <TableCell>{user.email}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>

      {rowErrors.length > 0 && (
        <div className="flex flex-col gap-2 border border-default-200 rounded-medium p-3">
          <Badge.Anchor>
            <h3 className="text-sm font-semibold">{t('errors.title')}</h3>
            <Badge color="danger" variant="soft">
              {rowErrors.length}
            </Badge>
          </Badge.Anchor>

          <Table>
            <TableScrollContainer>
              <TableContent aria-label="csv-invite-errors">
                <TableHeader>
                  <TableColumn isRowHeader>{t('errors.columns.row')}</TableColumn>
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
              </TableContent>
            </TableScrollContainer>
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
