// Resource selector table with search and selection state
// FEATURE: Resource selection for plugins using HeroUI v3 Table compound
import { useTranslations } from '../../i18n';
import { useResourcesServiceGetAllResources } from '@attraccess/react-query-client';
import { TextField, InputGroup, Input, Spinner, TableRoot, TableContent, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@heroui/react';
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

  const { t } = useTranslations({ de, en });

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
      <TableRoot aria-label={t('table.ariaLabel')}>
        <TableContent
          selectionMode={multiple ? 'multiple' : 'single'}


        >
          <TableHeader>
            <TableColumn className="w-full">
              {t('table.columns.name.header')}
            </TableColumn>
          </TableHeader>
          <TableBody items={resourceSearchResults?.data ?? []}>
            {(resource) => (
              <TableRow key={resource.id} id={String(resource.id)}>
                <TableCell>{resource.name}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableContent>
      </TableRoot>
    </div>
  );
}
