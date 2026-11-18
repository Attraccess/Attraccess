import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { Key, Pencil, Trash } from 'lucide-react';
import { SsoProvider } from '@attraccess/react-query-client';
import {
  EmptyState,
  TableActionsColumnHeader,
  TableRowActions,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

interface SSOProvidersTableProps {
  providers: SsoProvider[];
  onEdit: (provider: SsoProvider) => void;
  /** Runs after the user confirmed; rejects to keep the confirmation open. */
  onDelete: (id: number) => Promise<unknown>;
}

export const SSOProvidersTable = ({ providers, onEdit, onDelete }: SSOProvidersTableProps) => {
  const { t } = useTranslations({ en, de });

  if (!providers || providers.length === 0) {
    return (
      <div className="text-center p-8 rounded-lg border dark:border-gray-700 border-gray-200">
        <div className="text-gray-500 dark:text-gray-400">{t('noProviders')}</div>
      </div>
    );
  }

  return (
    <Table data-cy="sso-providers-table">
      <TableScrollContainer>
        <TableContent aria-label={t('table.ariaLabel')}>
          <TableHeader>
            <TableColumn isRowHeader>{t('id')}</TableColumn>
            <TableColumn>{t('name')}</TableColumn>
            <TableColumn>{t('type')}</TableColumn>
            <TableColumn id="actions">
              <TableActionsColumnHeader />
            </TableColumn>
          </TableHeader>
          <TableBody items={providers} renderEmptyState={() => <EmptyState />}>
            {(provider) => (
              <TableRow key={provider.id} id={provider.id}>
                <TableCell>
                  <span className="font-mono text-sm">{provider.id}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Key size={16} />
                    {provider.name}
                  </div>
                </TableCell>
                <TableCell>{provider.type}</TableCell>
                <TableCell>
                  <TableRowActions
                    itemName={provider.name}
                    actions={[
                      {
                        key: 'edit',
                        label: t('edit'),
                        icon: Pencil,
                        onPress: () => onEdit(provider),
                        'data-cy': `sso-provider-edit-button-${provider.id}`,
                      },
                      {
                        key: 'delete',
                        label: t('deleteText'),
                        icon: Trash,
                        tone: 'danger',
                        onPress: () => onDelete(provider.id),
                        'data-cy': `sso-provider-delete-button-${provider.id}`,
                        confirm: {
                          title: t('deleteProvider'),
                          message: t('deleteConfirmation'),
                          cancelLabel: t('cancel'),
                          confirmDataCy: 'sso-provider-delete-confirm-button',
                        },
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
};
