import { useTranslations } from '../../i18n';
import { useResourcesServiceGetAllResources } from '@attraccess/react-query-client';
import { Input, Spinner, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@heroui/react';
import { useState, PropsWithChildren } from 'react';
import de from './ResourceSelector.de.json';
import en from './ResourceSelector.en.json';

interface Props {
  selection: number[];
  onSelectionChange: (selection: number[]) => void;
}

export const ListboxWrapper = ({ children }: PropsWithChildren) => (
  <div className="border-small px-1 py-2 rounded-small border-default-200 dark:border-default-100">{children}</div>
);

export function ResourceSelector(props: Props) {
  const [search, setSearch] = useState('');

  const { t } = useTranslations({
    de,
    en,
  });

  const { data: resourceSearchResults, isLoading: isResourceSearchLoading } = useResourcesServiceGetAllResources({
    limit: 15,
    page: 1,
    search,
  });

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        label={t('search.label')}
        placeholder={t('search.placeholder')}
        className="w-full"
        variant="flat"
        endContent={isResourceSearchLoading ? <Spinner /> : null}
      />
      <Table
        selectedKeys={props.selection.map((id) => id.toString())}
        onSelectionChange={(keys) => props.onSelectionChange(Array.from(keys as Set<number>).map((key) => Number(key)))}
        selectionMode="multiple"
        color="primary"
        removeWrapper
      >
        <TableHeader>
          <TableColumn align="start" className="w-full">
            {t('table.columns.name.header')}
          </TableColumn>
        </TableHeader>
        <TableBody items={resourceSearchResults?.data ?? []}>
          {(resource) => (
            <TableRow key={resource.id}>
              <TableCell>{resource.name}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
