// Resource selector table with search and selection state
// FEATURE: Resource selection for plugins using HeroUI v3 Table compound
import { useTranslations } from '../../i18n';
import { useResourcesServiceGetAllResources } from '@attraccess/react-query-client';
import {
  Checkbox,
  TextField,
  Label,
  InputGroup,
  Spinner,
  TableRoot,
  TableScrollContainer,
  TableContent,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { SearchIcon } from 'lucide-react';
import { useState, PropsWithChildren } from 'react';
import de from './ResourceSelector.de.json';
import en from './ResourceSelector.en.json';

interface Props {
  selection: number[];
  onSelectionChange: (selection: number[]) => void;
  multiple?: boolean;
  listClassName?: string;
}

const MAX_VISIBLE_ROWS = 7;
const LIST_ROW_HEIGHT_PX = 49;
const LIST_HEADER_HEIGHT_PX = 44;

export const ListboxWrapper = ({ children }: PropsWithChildren) => (
  <div className="border-small px-1 py-2 rounded-small border-default-200 dark:border-default-100">{children}</div>
);

export function ResourceSelector(props: Readonly<Props>) {
  const { selection, onSelectionChange, multiple = true, listClassName = '' } = props;
  const [search, setSearch] = useState('');

  const { t } = useTranslations({ de, en });

  const { data: resourceSearchResults, isLoading: isResourceSearchLoading } = useResourcesServiceGetAllResources({
    limit: 15,
    page: 1,
    search,
  });

  return (
    <div className="flex flex-col gap-2">
      <TextField value={search} onChange={setSearch} className="w-full">
        <Label>{t('search.label')}</Label>
        <InputGroup>
          <InputGroup.Prefix>
            <SearchIcon className="size-4 text-muted" />
          </InputGroup.Prefix>
          <InputGroup.Input placeholder={t('search.placeholder')} />
          {isResourceSearchLoading ? (
            <InputGroup.Suffix>
              <Spinner size="sm" />
            </InputGroup.Suffix>
          ) : null}
        </InputGroup>
      </TextField>
      <TableRoot
        aria-label={t('table.ariaLabel')}
        className={listClassName}
        style={{ maxHeight: LIST_HEADER_HEIGHT_PX + MAX_VISIBLE_ROWS * LIST_ROW_HEIGHT_PX, overflowY: 'auto' }}
      >
        <TableScrollContainer>
          <TableContent
            selectionMode={multiple ? 'multiple' : 'single'}
            selectedKeys={new Set(selection.map(String))}
            onSelectionChange={(keys) => {
              if (keys === 'all') {
                onSelectionChange((resourceSearchResults?.data ?? []).map((r) => r.id));
                return;
              }
              onSelectionChange(Array.from(keys).map((k) => Number(k)));
            }}
          >
            <TableHeader>
              <TableColumn className="pr-0 w-0">
                {multiple ? (
                  <Checkbox aria-label={t('table.ariaLabel')} slot="selection">
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox>
                ) : null}
              </TableColumn>
              <TableColumn className="w-full" isRowHeader>
                {t('table.columns.name.header')}
              </TableColumn>
            </TableHeader>
            <TableBody items={resourceSearchResults?.data ?? []}>
              {(resource) => (
                <TableRow key={resource.id} id={String(resource.id)}>
                  <TableCell className="pr-0">
                    <Checkbox aria-label={resource.name} slot="selection" variant="secondary">
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox>
                  </TableCell>
                  <TableCell>{resource.name}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </TableRoot>
    </div>
  );
}
