import { ReactNode, useEffect, useRef } from 'react';
import { Button, ModalBody, ModalFooter, ModalHeader, ModalHeading, Spinner } from '@heroui/react';
import { PlusIcon } from 'lucide-react';
import { StandardModal, useTranslations } from '@attraccess/plugins-frontend-ui';
import { DashboardPinOperationKind } from '@attraccess/react-query-client';
import { useToastMessage } from '../../components/toastProvider';
import { DashboardPin, DashboardPinItem, pagePin, pinKey, useUpdateDashboardPins, widgetPin } from './pins';
import { usePinnablePages } from './pinnablePagesContext';
import { useDashboardWidgets } from './widgets/widgetsContext';
import de from './de.json';
import en from './en.json';

interface PickerItem {
  item: DashboardPinItem;
  title: string;
  /** The accessible name of its Add button, which tells a widget apart from the page with the same title. */
  addLabel: string;
  description?: string;
  icon: ReactNode;
}

/**
 * Keeps keyboard focus in the list when an added item disappears from it: on the item that took its place, else the
 * previous one, else the section heading.
 */
function useFocusAfterAdd(itemCount: number) {
  const sectionRef = useRef<HTMLElement>(null);
  const addedIndex = useRef<number | null>(null);

  useEffect(() => {
    const index = addedIndex.current;
    const section = sectionRef.current;
    if (index === null || !section) return;
    addedIndex.current = null;
    const buttons = section.querySelectorAll<HTMLElement>('[data-cy="dashboard-picker-add"]');
    (buttons[Math.min(index, buttons.length - 1)] ?? section.querySelector<HTMLElement>('h3'))?.focus();
  }, [itemCount]);

  return { sectionRef, rememberAdded: (index: number) => (addedIndex.current = index) };
}

function PickerSection({
  title,
  items,
  isLoading,
  onAdd,
  'data-cy': dataCy,
}: Readonly<{
  title: string;
  items: PickerItem[];
  isLoading: boolean;
  onAdd: (item: DashboardPinItem) => void;
  'data-cy': string;
}>) {
  const { t } = useTranslations({ en, de });
  const { sectionRef, rememberAdded } = useFocusAfterAdd(items.length);
  const headingId = `${dataCy}-heading`;

  const renderContent = () => {
    // Until the license and plugins have loaded, some items are still missing; "everything added" would be wrong.
    if (isLoading) return <Spinner size="sm" aria-label={t('picker.loading')} />;
    if (items.length === 0) return <p className="text-sm text-muted">{t('picker.allAdded')}</p>;
    return (
      <ul className="flex flex-col gap-2">
        {items.map(({ item, title: itemTitle, addLabel, description, icon }, index) => (
          <li key={pinKey(item)} className="flex items-center gap-3">
            <span className="shrink-0 text-muted">{icon}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{itemTitle}</span>
              {description && <span className="text-xs text-muted">{description}</span>}
            </span>
            <Button
              size="sm"
              variant="secondary"
              aria-label={addLabel}
              onPress={() => {
                rememberAdded(index);
                onAdd(item);
              }}
              data-cy="dashboard-picker-add"
            >
              <PlusIcon className="w-4 h-4" />
              {t('picker.add')}
            </Button>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <section ref={sectionRef} className="flex flex-col gap-2" aria-labelledby={headingId} data-cy={dataCy}>
      <h3 id={headingId} tabIndex={-1} className="text-sm font-semibold outline-none">
        {title}
      </h3>
      {renderContent()}
    </section>
  );
}

/** Lists the widgets and pages that are not on the dashboard yet. Adding one appends it and keeps the picker open. */
export function AddToDashboardModal({
  isOpen,
  onOpenChange,
  pins,
}: Readonly<{ isOpen: boolean; onOpenChange: (isOpen: boolean) => void; pins: DashboardPin[] }>) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const { mutate } = useUpdateDashboardPins();
  const { widgets, isReady: areWidgetsReady } = useDashboardWidgets();
  const { pages, isReady: arePagesReady } = usePinnablePages();
  const pinned = new Set(pins.map(pinKey));
  const notPinned = (entry: PickerItem) => !pinned.has(pinKey(entry.item));

  const widgetItems = widgets
    .map(({ id, title, description, icon }): PickerItem => ({
      item: widgetPin(id),
      title,
      addLabel: t('picker.addWidgetLabel', { title }),
      description,
      icon,
    }))
    .filter(notPinned);
  const pageItems = pages
    .map(({ path, title, icon }): PickerItem => ({
      item: pagePin(path),
      title,
      addLabel: t('picker.addLabel', { title }),
      icon,
    }))
    .filter(notPinned);

  const add = (item: DashboardPinItem) =>
    mutate(
      { requestBody: { kind: DashboardPinOperationKind.ADD, item } },
      { onError: () => toast.error({ title: t('pin.saveError') }) },
    );

  return (
    <StandardModal isOpen={isOpen} onOpenChange={onOpenChange} size="lg" data-cy="dashboard-picker">
      {({ close }) => (
        <>
          <ModalHeader>
            <ModalHeading>{t('picker.title')}</ModalHeading>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-6">
            <PickerSection
              title={t('picker.widgets')}
              items={widgetItems}
              isLoading={!areWidgetsReady}
              onAdd={add}
              data-cy="dashboard-picker-widgets"
            />
            <PickerSection
              title={t('picker.pages')}
              items={pageItems}
              isLoading={!arePagesReady}
              onAdd={add}
              data-cy="dashboard-picker-pages"
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={close} data-cy="dashboard-picker-close">
              {t('picker.close')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
