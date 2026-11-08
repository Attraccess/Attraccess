import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  Button,
  ProgressCircle,
  ProgressCircleFillCircle,
  ProgressCircleTrack,
  ProgressCircleTrackCircle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@heroui/react';
import { GripVertical, Info, RefreshCw } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { applyPwaUpdate, usePwaUpdateStore, type PwaUpdateStatus } from './updateController';
import { useDraggableCorner } from './useDraggableCorner';
import type { Corner } from './corner';

const TOAST_ID = 'pwa-update-downloading';
const TOAST_DURATION_MS = 4000;
const INSET = '1rem';
const ARROW_KEYS = 'ArrowUp ArrowDown ArrowLeft ArrowRight';

function anchor(corner: Corner): React.CSSProperties {
  const [vertical, horizontal] = corner.split('-');
  const sideInset = (side: string) => `calc(${INSET} + env(safe-area-inset-${side}))`;
  return {
    [vertical]: sideInset(vertical),
    [horizontal]: sideInset(horizontal),
  };
}

type Translate = ReturnType<typeof useTranslations>['t'];

function DownloadingRing({ percent, hintId, t }: { percent: number | null; hintId: string; t: Translate }) {
  const label = percent === null ? t('downloadingTooltipIndeterminate') : t('downloadingTooltip', { percent });
  return (
    <Tooltip>
      <TooltipTrigger
        role="progressbar"
        tabIndex={0}
        aria-label={t('downloading')}
        aria-describedby={hintId}
        aria-keyshortcuts={ARROW_KEYS}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={percent === null ? t('downloadingTooltipIndeterminate') : `${percent}%`}
        className="relative flex size-12 cursor-grab items-center justify-center rounded-full bg-overlay shadow-overlay active:cursor-grabbing"
      >
        {/* The outer element is the progressbar; hide the ring's own one so assistive tech sees a single bar. */}
        <div aria-hidden className="absolute inset-0 flex items-center justify-center">
          <ProgressCircle
            aria-label={t('downloading')}
            isIndeterminate={percent === null}
            value={percent ?? 0}
            size="lg"
          >
            <ProgressCircleTrack>
              <ProgressCircleTrackCircle />
              <ProgressCircleFillCircle />
            </ProgressCircleTrack>
          </ProgressCircle>
        </div>
        {percent !== null && <span className="relative text-[10px] font-medium">{percent}%</span>}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface ReadyCardProps {
  applying: boolean;
  titleId: string;
  focusReload: boolean;
  onLater: () => void;
  t: Translate;
}

function ReadyCard({ applying, titleId, focusReload, onLater, t }: ReadyCardProps) {
  return (
    <>
      <div
        aria-hidden
        title={t('moveHint')}
        className="flex cursor-grab items-center text-muted active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </div>
      <div className="flex flex-col gap-2 p-1">
        <div>
          <p id={titleId} className="text-sm font-medium">
            {t('ready.title')}
          </p>
          <p className="text-xs text-muted">{t('ready.description')}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" autoFocus={focusReload} isPending={applying} onPress={applyPwaUpdate}>
            {t('ready.reload')}
          </Button>
          <Button size="sm" variant="secondary" isDisabled={applying} onPress={onLater}>
            {t('ready.later')}
          </Button>
        </div>
      </div>
    </>
  );
}

function useDownloadToast(status: PwaUpdateStatus, t: Translate) {
  const [toastDone, setToastDone] = useState(false);
  const sawDownload = useRef(false);

  useEffect(() => {
    if (status === 'downloading' && !sawDownload.current) {
      sawDownload.current = true;
      setToastDone(false);
      toast.info(t('toast.title'), {
        id: TOAST_ID,
        // Same icon as the app's other info toasts (components/toastProvider.tsx).
        icon: <Info className="h-5 w-5 text-accent" />,
        description: t('toast.description'),
        duration: TOAST_DURATION_MS,
        onDismiss: () => setToastDone(true),
        onAutoClose: () => setToastDone(true),
      });
    } else if (status === 'ready') {
      toast.dismiss(TOAST_ID);
    } else if (status === 'idle') {
      sawDownload.current = false;
      toast.dismiss(TOAST_ID);
    }
  }, [status, t]);

  return toastDone;
}

type FocusOnMount = 'collapsed' | 'reload' | null;

export function PwaUpdateIndicator() {
  const { t } = useTranslations({ en, de });
  const status = usePwaUpdateStore((s) => s.status);
  const hintId = useId();
  const ready = status === 'ready' || status === 'applying';

  // Portal: outside pull-to-refresh (its touch handlers and transform) and last in the tab order.
  return createPortal(
    <>
      {/* Mounted empty so screen readers announce the text when it appears, once per update. */}
      <div aria-live="polite" className="sr-only">
        {ready ? t('ready.title') : ''}
      </div>
      <span id={hintId} hidden>
        {t('moveHint')}
      </span>
      <FloatingIndicator status={status} hintId={hintId} t={t} />
    </>,
    document.body,
  );
}

function FloatingIndicator({ status, hintId, t }: { status: PwaUpdateStatus; hintId: string; t: Translate }) {
  const progress = usePwaUpdateStore((s) => s.progress);
  const { ref, corner, offset, animating, handlers } = useDraggableCorner();
  const [collapsed, setCollapsed] = useState(false);
  // Only a user's Later / reopen moves focus; the indicator never takes focus on its own.
  const [focusOnMount, setFocusOnMount] = useState<FocusOnMount>(null);
  const titleId = useId();
  const toastDone = useDownloadToast(status, t);

  useEffect(() => {
    // A later update must not take focus because of an earlier Later / reopen.
    if (status === 'idle' || status === 'downloading') setFocusOnMount(null);
    if (status === 'idle') setCollapsed(false);
  }, [status]);

  if (status === 'idle' || (status === 'downloading' && !toastDone)) return null;

  const motion = animating ? 'transition-transform duration-200 motion-reduce:transition-none' : '';
  const style: React.CSSProperties = {
    ...anchor(corner),
    // Above toasts and page content, below modal backdrops.
    zIndex: 40,
    touchAction: 'none',
    transform: offset ? `translate(${offset.x}px, ${offset.y}px)` : undefined,
  };

  if (status === 'downloading') {
    return (
      <div
        ref={ref}
        className={`fixed select-none ${motion} animate-in fade-in zoom-in-95 motion-reduce:animate-none`}
        style={style}
        {...handlers}
      >
        <DownloadingRing percent={progress === null ? null : Math.round(progress * 100)} hintId={hintId} t={t} />
      </div>
    );
  }

  if (collapsed) {
    return (
      <div ref={ref} className={`fixed select-none ${motion}`} style={style} {...handlers}>
        <Button
          isIconOnly
          variant="primary"
          className="size-11 rounded-full shadow-overlay"
          aria-label={t('ready.reopen')}
          aria-describedby={hintId}
          aria-keyshortcuts={ARROW_KEYS}
          autoFocus={focusOnMount === 'collapsed'}
          onPress={() => {
            setFocusOnMount('reload');
            setCollapsed(false);
          }}
        >
          <RefreshCw className="size-5" />
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={titleId}
      aria-describedby={hintId}
      aria-keyshortcuts={ARROW_KEYS}
      tabIndex={0}
      className={`fixed flex max-w-[calc(100vw-2rem)] select-none items-stretch gap-1 rounded-2xl border border-border bg-overlay p-2 shadow-overlay animate-in fade-in zoom-in-95 motion-reduce:animate-none ${motion}`}
      style={style}
      {...handlers}
    >
      <ReadyCard
        applying={status === 'applying'}
        titleId={titleId}
        focusReload={focusOnMount === 'reload'}
        onLater={() => {
          setFocusOnMount('collapsed');
          setCollapsed(true);
        }}
        t={t}
      />
    </div>
  );
}
