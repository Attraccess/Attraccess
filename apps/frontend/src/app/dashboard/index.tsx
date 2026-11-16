import { useEffect, useRef, useState } from 'react';
import { Button, Link, Spinner } from '@heroui/react';
import { CheckIcon, LayoutDashboardIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { PageAction, PageHeader, StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import { RootRedirect } from '../routes/RootRedirect';
import { AddToDashboardModal } from './AddToDashboardModal';
import { DashboardGrid } from './DashboardGrid';
import { DashboardPin, useDashboardPins } from './pins';
import de from './de.json';
import en from './en.json';

function LoadingDashboard() {
  return (
    <div className="flex justify-center py-12">
      <Spinner color="accent" data-cy="dashboard-loading" />
    </div>
  );
}

interface DashboardContentProps {
  isEditing: boolean;
  onRemoved: (index: number) => void;
  /** Enters edit mode with the picker open. */
  onAdd: () => void;
}

function EmptyDashboard({ onAdd }: Readonly<Pick<DashboardContentProps, 'onAdd'>>) {
  const { t } = useTranslations({ en, de });

  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center" data-cy="dashboard-empty">
      <LayoutDashboardIcon className="w-10 h-10 text-muted" aria-hidden />
      <h2 className="text-lg font-semibold">{t('empty.title')}</h2>
      <p className="max-w-md text-sm text-muted">{t('empty.description')}</p>
      <Button variant="primary" onPress={onAdd} data-cy="dashboard-empty-add">
        <PlusIcon className="w-4 h-4" />
        {t('edit.add')}
      </Button>
      <Link href="/resources">{t('empty.browseResources')}</Link>
    </div>
  );
}

function DashboardContent({ isEditing, onAdd, onRemoved }: Readonly<DashboardContentProps>) {
  const { t } = useTranslations({ en, de });
  const { data: pins, isPending, refetch, isRefetching } = useDashboardPins();

  if (isPending) return <LoadingDashboard />;

  // A failed refetch keeps the list it already has; only a list that never loaded shows the error.
  if (!pins) {
    return (
      <div className="flex flex-col items-start gap-3" data-cy="dashboard-load-error">
        <StatusAlert status="danger" title={t('loadError.title')}>
          {t('loadError.description')}
        </StatusAlert>
        <Button variant="secondary" onPress={() => void refetch()} isPending={isRefetching}>
          {t('loadError.retry')}
        </Button>
      </div>
    );
  }

  if (pins.length === 0) return <EmptyDashboard onAdd={onAdd} />;
  return <DashboardGrid pins={pins} isEditing={isEditing} onRemoved={onRemoved} />;
}

/** "Add to dashboard" while editing, and the one Edit/Done toggle, which keeps focus as its label changes. */
function useEditActions(
  pins: DashboardPin[] | undefined,
  isEditing: boolean,
  setIsEditing: (isEditing: boolean) => void,
  openPicker: () => void,
): PageAction[] {
  const { t } = useTranslations({ en, de });
  const label = isEditing ? t('edit.done') : t('edit.start');

  return [
    {
      key: 'add',
      label: t('edit.add'),
      icon: <PlusIcon className="w-4 h-4" />,
      variant: 'primary',
      isHidden: !isEditing || !pins?.length,
      onPress: openPicker,
      dataCy: 'dashboard-add',
    },
    {
      key: 'edit',
      label,
      isHidden: !pins,
      renderTrigger: (triggerProps) => (
        <Button
          {...triggerProps}
          variant={isEditing ? 'primary' : triggerProps.variant}
          aria-pressed={isEditing}
          onPress={() => setIsEditing(!isEditing)}
          data-cy="dashboard-edit-toggle"
        >
          {isEditing ? <CheckIcon className="w-4 h-4" /> : <PencilIcon className="w-4 h-4" />}
          {label}
        </Button>
      ),
    },
  ];
}

const ADD_TARGETS = '[data-cy="dashboard-add"], [data-cy="dashboard-empty-add"]';

/**
 * Keeps keyboard focus on the page when its focused element disappears: after removing a card, on the card that took
 * its place (else the previous one, else "Add to dashboard"); after closing the picker opened from the empty state,
 * whose button is gone once something was added, on "Add to dashboard".
 */
function useDashboardFocus(pinCount: number | undefined) {
  const pageRef = useRef<HTMLDivElement>(null);
  const removedIndex = useRef<number | null>(null);

  useEffect(() => {
    const index = removedIndex.current;
    const page = pageRef.current;
    if (index === null || !page) return;
    removedIndex.current = null;
    const removeButtons = page.querySelectorAll<HTMLElement>('[data-cy="dashboard-card-remove-control"]');
    (removeButtons[Math.min(index, removeButtons.length - 1)] ?? page.querySelector<HTMLElement>(ADD_TARGETS))?.focus();
  }, [pinCount]);

  const onPickerClosed = () =>
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) pageRef.current?.querySelector<HTMLElement>(ADD_TARGETS)?.focus();
    });

  return { pageRef, onRemoved: (index: number) => (removedIndex.current = index), onPickerClosed };
}

export function DashboardPage() {
  const { t } = useTranslations({ en, de });
  const { data: pins } = useDashboardPins();
  // Local on purpose: leaving the page leaves edit mode.
  const [isEditing, setIsEditing] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const actions = useEditActions(pins, isEditing, setIsEditing, () => setIsPickerOpen(true));
  const { pageRef, onRemoved, onPickerClosed } = useDashboardFocus(pins?.length);
  const onPickerOpenChange = (isOpen: boolean) => {
    setIsPickerOpen(isOpen);
    if (!isOpen) onPickerClosed();
  };

  return (
    <div ref={pageRef}>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<LayoutDashboardIcon />} actions={actions} />
      {isEditing && !!pins?.length && (
        <p className="mb-4 text-sm text-muted" data-cy="dashboard-edit-hint">
          {t('edit.hint')}
        </p>
      )}
      <DashboardContent
        isEditing={isEditing}
        onRemoved={onRemoved}
        onAdd={() => {
          setIsEditing(true);
          setIsPickerOpen(true);
        }}
      />
      {pins && <AddToDashboardModal isOpen={isPickerOpen} onOpenChange={onPickerOpenChange} pins={pins} />}
    </div>
  );
}

/**
 * The start page. A user with pins sees the dashboard; a user without any keeps landing on the resource overview,
 * with query and hash intact. A failed load shows the dashboard's retry instead of guessing "no pins".
 */
export function DashboardLanding() {
  const { data: pins, isPending } = useDashboardPins();
  // Once shown, the dashboard stays: unpinning the last card shows its empty state instead of leaving the page.
  const hasShownDashboard = useRef(false);

  if (isPending) return <LoadingDashboard />;
  if (pins?.length === 0 && !hasShownDashboard.current) return <RootRedirect />;
  hasShownDashboard.current = true;
  return <DashboardPage />;
}
