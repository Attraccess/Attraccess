import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Button,
  ProgressCircle,
  ProgressCircleFillCircle,
  ProgressCircleTrack,
  ProgressCircleTrackCircle,
  Tooltip,
  TooltipContent,
} from '@heroui/react';
import { GripVertical, RefreshCw } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { applyPwaUpdate, usePwaUpdateStore, type PwaUpdateStatus } from './updateController';
import { useDraggableCorner } from './useDraggableCorner';
import type { Corner } from './corner';

const TOAST_ID = 'pwa-update-downloading';
const TOAST_DURATION_MS = 4000;
const INSET = '1rem';

function anchor(corner: Corner): React.CSSProperties {
  const [vertical, horizontal] = corner.split('-');
  const sideInset = (side: string) => `calc(${INSET} + env(safe-area-inset-${side}))`;
  return {
    [vertical]: sideInset(vertical),
    [horizontal]: sideInset(horizontal),
  };
}

type Translate = ReturnType<typeof useTranslations>['t'];

function DownloadingRing({ percent, t }: { percent: number | null; t: Translate }) {
  const label = percent === null ? t('downloadingTooltipIndeterminate') : t('downloadingTooltip', { percent });
  return (
    <Tooltip>
      <div
        role="progressbar"
        tabIndex={0}
        aria-label={t('downloading')}
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
      </div>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ReadyCard({ applying, onLater, t }: { applying: boolean; onLater: () => void; t: Translate }) {
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
        <div aria-live="polite">
          <p className="text-sm font-medium">{t('ready.title')}</p>
          <p className="text-xs text-muted">{t('ready.description')}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" isPending={applying} onPress={applyPwaUpdate}>
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

export function PwaUpdateIndicator() {
  const { t } = useTranslations({ en, de });
  const status = usePwaUpdateStore((s) => s.status);
  const progress = usePwaUpdateStore((s) => s.progress);
  const { ref, corner, offset, animating, handlers } = useDraggableCorner();
  const [collapsed, setCollapsed] = useState(false);
  const toastDone = useDownloadToast(status, t);

  useEffect(() => {
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
        <DownloadingRing percent={progress === null ? null : Math.round(progress * 100)} t={t} />
      </div>
    );
  }

  if (collapsed) {
    return (
      <div ref={ref} className={`fixed ${motion}`} style={style} {...handlers}>
        <Button
          isIconOnly
          variant="primary"
          className="size-11 rounded-full shadow-overlay"
          aria-label={t('ready.reopen')}
          onPress={() => setCollapsed(false)}
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
      aria-label={t('ready.title')}
      tabIndex={0}
      className={`fixed flex max-w-[calc(100vw-2rem)] select-none items-stretch gap-1 rounded-2xl border border-border bg-overlay p-2 shadow-overlay animate-in fade-in zoom-in-95 motion-reduce:animate-none ${motion}`}
      style={style}
      {...handlers}
    >
      <ReadyCard applying={status === 'applying'} onLater={() => setCollapsed(true)} t={t} />
    </div>
  );
}
