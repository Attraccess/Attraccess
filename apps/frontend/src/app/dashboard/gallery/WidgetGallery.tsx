import { ReactNode, useState } from 'react';
import { Button, Label, ModalBody, ModalFooter, ModalHeader, ModalHeading, SearchField, Spinner } from '@heroui/react';
import { EmptyState, StandardModal, useTranslations, useTranslationState } from '@attraccess/plugins-frontend-ui';
import { DashboardPinItemType, DashboardPinOperationKind, DashboardPinSize } from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import { useIsDesktop } from '../../../hooks/useIsDesktop';
import usePluginState from '../../plugins/plugin.state';
import { DashboardPin, DashboardPinItem, pagePin, pinKey, useUpdateDashboardPins, widgetPin } from '../pins';
import { usePinnablePages } from '../pinnablePagesContext';
import { PAGE_TILE_SIZES, RESOURCE_TILE_SIZES, TileSize } from '../sizes';
import { useDashboardWidgets } from '../widgets/widgetsContext';
import { GalleryEntry, groupGalleryEntries, matchesSearch } from './galleryEntries';
import { AddButton, GalleryTile, PagePreview, WidgetPreview } from './GalleryTile';
import { ResourceGalleryTile } from './ResourceGalleryTile';
import de from '../de.json';
import en from '../en.json';
import widgetsDe from '../widgets/de.json';
import widgetsEn from '../widgets/en.json';

const RESOURCE_ENTRY_KEY = 'resource';

/** Every widget and page the user may use, and the Resource entry, as gallery entries. */
function useGalleryEntries() {
  const { t } = useTranslations({ en, de });
  const { widgets, isReady: areWidgetsReady } = useDashboardWidgets();
  const { pages, isReady: arePagesReady } = usePinnablePages();

  const entries: GalleryEntry[] = [
    ...widgets.map((widget): GalleryEntry => ({
      key: pinKey(widgetPin(widget.id)),
      kind: 'widget',
      title: widget.title,
      description: widget.description,
      groupId: widget.group.id,
      keywords: widget.keywords,
      sizes: widget.sizes,
      defaultSize: widget.defaultSize,
      item: widgetPin(widget.id),
    })),
    {
      key: RESOURCE_ENTRY_KEY,
      kind: 'resource',
      title: t('gallery.resource.title'),
      description: t('gallery.resource.description'),
      groupId: 'resources',
      ...RESOURCE_TILE_SIZES,
    },
    ...pages.map((page): GalleryEntry => ({
      key: pinKey(pagePin(page.path)),
      kind: 'page',
      title: page.title,
      description: t('gallery.shortcutDescription'),
      groupId: page.galleryGroup,
      ...PAGE_TILE_SIZES,
      item: pagePin(page.path),
    })),
  ];

  return { entries, widgets, pages, isReady: areWidgetsReady && arePagesReady };
}

/** The search field at the top of the gallery, sticky while the tiles scroll. */
function GallerySearch({ term, onChange }: Readonly<{ term: string; onChange: (term: string) => void }>) {
  const { t } = useTranslations({ en, de });

  return (
    <div className="sticky top-0 z-10 bg-overlay pb-2">
      <SearchField fullWidth value={term} onChange={onChange} variant="secondary" data-cy="dashboard-gallery-search">
        <Label className="sr-only">{t('gallery.searchLabel')}</Label>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder={t('gallery.searchLabel')} />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
    </div>
  );
}

/**
 * The "Add widget" gallery: live previews of every widget and page shortcut the user may add, grouped by feature and
 * plugin, searchable, each with its size choice. Adding appends the item and keeps the gallery open; items already on
 * the dashboard stay listed as "Added".
 */
export function WidgetGallery({
  isOpen,
  onOpenChange,
  pins,
}: Readonly<{ isOpen: boolean; onOpenChange: (isOpen: boolean) => void; pins: DashboardPin[] }>) {
  const { t } = useTranslations({ en, de });
  const { t: tWidgets } = useTranslations({ en: widgetsEn, de: widgetsDe });
  const language = useTranslationState((state) => state.language);
  const isDesktop = useIsDesktop();
  const toast = useToastMessage();
  const { mutate } = useUpdateDashboardPins();
  const plugins = usePluginState((state) => state.plugins);
  const { entries, widgets, pages, isReady } = useGalleryEntries();
  const [term, setTerm] = useState('');
  // The search is not kept: the gallery opens unfiltered every time.
  const onGalleryOpenChange = (open: boolean) => {
    if (!open) setTerm('');
    onOpenChange(open);
  };

  const pinned = new Set(pins.map(pinKey));
  const pinnedResourceIds = new Set(
    pins.filter((pin) => pin.itemType === DashboardPinItemType.RESOURCE).map((pin) => pin.itemId),
  );
  const add = (item: DashboardPinItem, size: TileSize) =>
    mutate(
      { body: { kind: DashboardPinOperationKind.ADD, item, size: size as DashboardPinSize } },
      { onError: () => toast.error({ title: t('pin.saveError') }) },
    );

  const groups = groupGalleryEntries({
    entries,
    builtInTitles: (id) => tWidgets(`groups.${id}`),
    knownGroups: widgets.map((widget) => widget.group),
    pluginNames: plugins.map((plugin) => plugin.name),
  })
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => matchesSearch(entry, group.title, term, language)),
    }))
    .filter((group) => group.entries.length > 0);

  const renderEntry = (entry: GalleryEntry): ReactNode => {
    if (entry.kind === 'resource') {
      return <ResourceGalleryTile key={entry.key} pinnedResourceIds={pinnedResourceIds} onAdd={add} />;
    }
    const widget =
      entry.kind === 'widget' ? widgets.find((candidate) => pinKey(widgetPin(candidate.id)) === entry.key) : undefined;
    const page =
      entry.kind === 'page' ? pages.find((candidate) => pinKey(pagePin(candidate.path)) === entry.key) : undefined;
    const item = entry.item as DashboardPinItem;
    return (
      <GalleryTile
        key={entry.key}
        title={entry.title}
        description={entry.description}
        sizes={entry.sizes}
        defaultSize={entry.defaultSize}
        renderPreview={(size) =>
          widget ? <WidgetPreview widget={widget} size={size} /> : page && <PagePreview page={page} />
        }
        renderActions={(size) => (
          <AddButton
            label={t(entry.kind === 'widget' ? 'gallery.addWidgetLabel' : 'gallery.addShortcutLabel', {
              title: entry.title,
            })}
            addedLabel={t(entry.kind === 'widget' ? 'gallery.addedWidgetLabel' : 'gallery.addedShortcutLabel', {
              title: entry.title,
            })}
            isAdded={pinned.has(entry.key)}
            onAdd={() => add(item, size)}
          />
        )}
        data-cy={`dashboard-gallery-entry-${entry.kind}`}
      />
    );
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onOpenChange={onGalleryOpenChange}
      size={isDesktop ? 'lg' : 'full'}
      dialogProps={{ className: isDesktop ? 'w-full max-w-[95vw] sm:w-[56rem]' : undefined }}
      data-cy="dashboard-picker"
    >
      {({ close }) => (
        <>
          <ModalHeader>
            {/* Level 2, above the group headings (h3) and the entries (h4). */}
            <ModalHeading level={2}>{t('gallery.title')}</ModalHeading>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-6">
            <GallerySearch term={term} onChange={setTerm} />
            {groups.map((group, index) => (
              <section
                key={group.id}
                className="@container flex flex-col gap-3"
                // By position: group ids may hold spaces (plugin group titles), which aria-labelledby would split.
                aria-labelledby={`dashboard-gallery-group-${index}`}
                data-cy="dashboard-gallery-group"
              >
                <h3 id={`dashboard-gallery-group-${index}`} className="text-sm font-semibold">
                  {group.title}
                </h3>
                <ul className="grid grid-cols-1 gap-6 @min-[36rem]:grid-cols-2">{group.entries.map(renderEntry)}</ul>
              </section>
            ))}
            {/* Until the license and plugins have loaded, some entries are still missing. */}
            {!isReady && (
              // A spinner's own label is not read out; the status role and hidden text are.
              <div role="status" className="flex justify-center">
                <Spinner size="sm" aria-hidden />
                <span className="sr-only">{t('gallery.loading')}</span>
              </div>
            )}
            {isReady && groups.length === 0 && <EmptyState message={t('gallery.noMatch', { term: term.trim() })} />}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={close} data-cy="dashboard-picker-close">
              {t('gallery.close')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
