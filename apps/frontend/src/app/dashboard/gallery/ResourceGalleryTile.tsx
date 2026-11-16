import { Key, useState } from 'react';
import { ComboBox, Input, Label, ListBox } from '@heroui/react';
import { useDebounce, useTranslations } from '@attraccess/plugins-frontend-ui';
import { DashboardPinItemType, useResourcesServiceGetAllResources } from '@attraccess/react-query-client';
import { DashboardPinItem } from '../pins';
import { RESOURCE_TILE_SIZES, TileSize } from '../sizes';
import { AddButton, GalleryTile, ResourcePreview } from './GalleryTile';
import de from '../de.json';
import en from '../en.json';

const SEARCH_LIMIT = 20;

/** Searches resources as the user types, with the same visibility as the resource overview. */
function useResourceSearch(term: string) {
  const search = useDebounce(term.trim(), 300);
  const { data, isFetching } = useResourcesServiceGetAllResources({ search: search || undefined, limit: SEARCH_LIMIT });
  return { resources: data?.data ?? [], isFetching };
}

/** The gallery's Resource entry: choose one resource, then pin it with its status and session controls. */
export function ResourceGalleryTile({
  pinnedResourceIds,
  onAdd,
}: Readonly<{ pinnedResourceIds: Set<string>; onAdd: (item: DashboardPinItem, size: TileSize) => void }>) {
  const { t } = useTranslations({ en, de });
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const { resources } = useResourceSearch(term);
  const items = resources.map((resource) => ({ id: String(resource.id), name: resource.name }));

  const select = (key: Key | null) => {
    setSelected(key === null ? null : String(key));
    const chosen = items.find((item) => item.id === String(key));
    if (chosen) setTerm(chosen.name);
  };

  return (
    <GalleryTile
      title={t('gallery.resource.title')}
      description={t('gallery.resource.description')}
      {...RESOURCE_TILE_SIZES}
      renderPreview={(size) => <ResourcePreview size={size} />}
      renderActions={(size) => (
        <>
          <ComboBox
            className="min-w-48 flex-1"
            items={items}
            inputValue={term}
            onInputChange={(value) => {
              setTerm(value);
              if (!value) setSelected(null);
            }}
            selectedKey={selected}
            onSelectionChange={select}
            disabledKeys={[...pinnedResourceIds]}
            data-cy="dashboard-gallery-resource-choose"
          >
            <Label>{t('gallery.resource.choose')}</Label>
            <ComboBox.InputGroup>
              <Input />
              <ComboBox.Trigger />
            </ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {(item: { id: string; name: string }) => (
                  <ListBox.Item id={item.id} textValue={item.name}>
                    {item.name}
                  </ListBox.Item>
                )}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
          <AddButton
            label={t('gallery.addResourceLabel')}
            isAdded={false}
            isDisabled={!selected || pinnedResourceIds.has(selected)}
            onAdd={() => {
              if (!selected) return;
              onAdd({ itemType: DashboardPinItemType.RESOURCE, itemId: selected }, size);
              setSelected(null);
              setTerm('');
            }}
          />
        </>
      )}
      data-cy="dashboard-gallery-resource"
    />
  );
}
