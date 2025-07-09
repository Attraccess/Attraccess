import { useTranslations } from '../../i18n';
import { useResourcesServiceGetAllResources } from '@attraccess/react-query-client';
import { Chip, Input, Listbox, ListboxItem, ScrollShadow, Spinner } from '@heroui/react';
import { useState, PropsWithChildren, useMemo } from 'react';
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

  const { t } = useTranslations('plugin-attractap-resource-selector', {
    de,
    en,
  });

  const { data: selectedResources } = useResourcesServiceGetAllResources({
    ids: props.selection,
  });

  const { data: resourceSearchResults, isLoading: isResourceSearchLoading } = useResourcesServiceGetAllResources({
    limit: 15,
    page: 1,
    search,
  });

  const topContent = useMemo(() => {
    return (
      <>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          label={t('search.label')}
          placeholder={t('search.placeholder')}
          className="w-full"
          variant="flat"
          endContent={isResourceSearchLoading ? <Spinner /> : null}
        />
        {props.selection.length > 0 ? (
          <ScrollShadow hideScrollBar className="w-full flex py-0.5 px-2 gap-1" orientation="horizontal">
            {(selectedResources?.data ?? []).map((resource) => (
              <Chip key={resource.id}>{resource.name}</Chip>
            ))}
          </ScrollShadow>
        ) : null}
      </>
    );
  }, [props, search, t, selectedResources, isResourceSearchLoading]);

  return (
    <div>
      <ListboxWrapper>
        <Listbox
          classNames={{
            list: 'max-h-[300px] overflow-scroll',
          }}
          defaultSelectedKeys={props.selection}
          items={resourceSearchResults?.data ?? []}
          label={t('list.label')}
          selectionMode="multiple"
          topContent={topContent}
          variant="flat"
          onSelectionChange={(keys) => {
            props.onSelectionChange(Array.from(keys as Set<number>));
          }}
        >
          {(resource) => (
            <ListboxItem key={resource.id} textValue={resource.name}>
              <div className="flex gap-2 items-center">
                {/*<Avatar alt={item.name} className="flex-shrink-0" size="sm" src={item.avatar} />*/}
                <div className="flex flex-col">
                  <span className="text-small">{resource.name}</span>
                </div>
              </div>
            </ListboxItem>
          )}
        </Listbox>
      </ListboxWrapper>
    </div>
  );
}
