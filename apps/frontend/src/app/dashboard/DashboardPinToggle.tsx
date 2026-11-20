import { useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { ToggleButton } from '@heroui/react';
import { StarIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { DashboardPinOperationKind } from '@attraccess/react-query-client';
import { useToastMessage } from '../../components/toastProvider';
import { DashboardPinItem, pagePin, pinKey, useDashboardPins, useUpdateDashboardPins } from './pins';
import { usePinnablePages } from './pinnablePagesContext';
import { DashboardPinTargetContext } from './pinTarget';
import de from './de.json';
import en from './en.json';

/**
 * Pins and unpins one item. Disabled until the pins have loaded, so a failed load cannot overwrite stored pins. While
 * a change saves, presses are ignored rather than disabling the button, which would drop keyboard focus.
 */
export function DashboardPinToggle({ item }: Readonly<{ item: DashboardPinItem }>) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const { data: pins } = useDashboardPins();
  const { mutate, isPending } = useUpdateDashboardPins();
  const isPinned = !!pins?.some((pin) => pinKey(pin) === pinKey(item));

  return (
    <ToggleButton
      isIconOnly
      size="sm"
      variant="ghost"
      isSelected={isPinned}
      isDisabled={!pins}
      aria-label={isPinned ? t('pin.remove') : t('pin.add')}
      data-cy="dashboard-pin-toggle"
      onChange={(pin) => {
        if (isPending) return;
        mutate(
          { body: { kind: pin ? DashboardPinOperationKind.ADD : DashboardPinOperationKind.REMOVE, item } },
          { onError: () => toast.error({ title: t('pin.saveError') }) },
        );
      }}
    >
      <StarIcon className="w-4 h-4" fill={isPinned ? 'currentColor' : 'none'} />
    </ToggleButton>
  );
}

/**
 * The host's PageHeader accessory: the pin toggle for the item of the current page, when that item can be pinned.
 * Pages are pinnable when they are permitted sidebar pages; kiosk, external and dashboard paths never are.
 */
export function DashboardPinHeaderAccessory() {
  const target = useContext(DashboardPinTargetContext);
  const { pathname } = useLocation();
  const { pages } = usePinnablePages();
  const item = target ?? (pages.some((page) => page.path === pathname) ? pagePin(pathname) : null);

  return item ? <DashboardPinToggle item={item} /> : null;
}
