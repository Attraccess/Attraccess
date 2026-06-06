import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  Tooltip,
  TooltipContent,
} from '@heroui/react';
import { Key, Pencil, Trash } from 'lucide-react';
import { SSOProvider } from '@attraccess/react-query-client';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/emptyState';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

interface SSOProvidersTableProps {
  providers: SSOProvider[];
  onEdit: (provider: SSOProvider) => void;
  onDelete: (id: number) => void;
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
            <TableColumn>{t('actions')}</TableColumn>
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
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <Button
                        variant="ghost"
                        isIconOnly
                        onPress={() => onEdit(provider)}
                        data-cy={`sso-provider-edit-button-${provider.id}`}
                      >
                        <Pencil size={16} />
                      </Button>
                      <TooltipContent>{t('edit')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <Button
                        variant="danger-soft"
                        isIconOnly
                        onPress={() => onDelete(provider.id)}
                        data-cy={`sso-provider-delete-button-${provider.id}`}
                      >
                        <Trash size={16} />
                      </Button>
                      <TooltipContent>{t('deleteText')}</TooltipContent>
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
};
