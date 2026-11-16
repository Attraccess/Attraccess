import { ReactNode } from 'react';
import { Button, ModalBody, ModalFooter, ModalHeader, ModalHeading } from '@heroui/react';
import { PlusIcon } from 'lucide-react';
import { EmptyState, StandardModal, useTranslations } from '@attraccess/plugins-frontend-ui';
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
  description?: string;
  icon: ReactNode;
}

function PickerSection({
  title,
  items,
  onAdd,
  'data-cy': dataCy,
}: Readonly<{ title: string; items: PickerItem[]; onAdd: (item: DashboardPinItem) => void; 'data-cy': string }>) {
  const { t } = useTranslations({ en, de });

  return (
    <section className="flex flex-col gap-2" aria-label={title} data-cy={dataCy}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <EmptyState message={t('picker.allAdded')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map(({ item, title: itemTitle, description, icon }) => (
            <li key={pinKey(item)} className="flex items-center gap-3">
              <span className="shrink-0 text-muted">{icon}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{itemTitle}</span>
                {description && <span className="text-xs text-muted">{description}</span>}
              </span>
              <Button
                size="sm"
                variant="secondary"
                aria-label={t('picker.addLabel', { title: itemTitle })}
                onPress={() => onAdd(item)}
                data-cy="dashboard-picker-add"
              >
                <PlusIcon className="w-4 h-4" />
                {t('picker.add')}
              </Button>
            </li>
          ))}
        </ul>
      )}
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
  const { widgets } = useDashboardWidgets();
  const { pages } = usePinnablePages();
  const pinned = new Set(pins.map(pinKey));
  const notPinned = (entry: PickerItem) => !pinned.has(pinKey(entry.item));

  const widgetItems = widgets
    .map(({ id, title, description, icon }): PickerItem => ({ item: widgetPin(id), title, description, icon }))
    .filter(notPinned);
  const pageItems = pages
    .map(({ path, title, icon }): PickerItem => ({ item: pagePin(path), title, icon }))
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
              onAdd={add}
              data-cy="dashboard-picker-widgets"
            />
            <PickerSection title={t('picker.pages')} items={pageItems} onAdd={add} data-cy="dashboard-picker-pages" />
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
