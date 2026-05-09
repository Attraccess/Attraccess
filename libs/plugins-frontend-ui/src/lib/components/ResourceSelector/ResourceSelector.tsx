import { useTranslations } from '../../i18n';
import { useResourcesServiceGetAllResources } from '@attraccess/react-query-client';
import { TextField, InputGroup, Input, Spinner, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@heroui/react';
import { useState, PropsWithChildren } from 'react';
import de from './ResourceSelector.de.json';
import en from './ResourceSelector.en.json';

interface Props {
  selection: number[];
  onSelectionChange: (selection: number[]) => void;
  multiple?: boolean;
}

export const ListboxWrapper = ({ children }: PropsWithChildren) => (
  <div className="border-small px-1 py-2 rounded-small border-default-200 dark:border-default-100">{children}</div>
);

export function ResourceSelector(props: Readonly<Props>) {
  const { selection, onSelectionChange, multiple = true } = props;
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
      <TextField value={search} onChange={setSearch} aria-label={t('search.label')} className="w-full">
        <InputGroup>
          <Input placeholder={t('search.placeholder')} />
          {isResourceSearchLoading ? <Spinner /> : null}
        </InputGroup>
      </TextField>
      <Table
        aria-label={t('table.ariaLabel')}
        selectedKeys={selection.map((id) => id.toString())}
        onSelectionChange={(keys) => onSelectionChange(Array.from(keys as Set<number>).map((key) => Number(key)))}
        selectionMode={multiple ? 'multiple' : 'single'}
        color="primary"

      >
        <TableHeader>
          <TableColumn className="w-full">
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
