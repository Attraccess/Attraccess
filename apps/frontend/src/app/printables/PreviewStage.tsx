import type { ReactNode } from 'react';
import { Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import type { RenderStatus } from './useWorkerRender';
import de from './de.json';
import en from './en.json';

interface PreviewStageProps {
  status: RenderStatus;
  /** The preview, once a render exists. */
  children: ReactNode;
}

/** The area holding a model's 3D preview, with the rendering spinner over it. */
export function PreviewStage({ status, children }: PreviewStageProps) {
  const { t } = useTranslations({ de, en });

  return (
    // min-h matches Preview's own height so the first render — when there is no canvas yet —
    // still has somewhere to show the spinner instead of collapsing to nothing.
    <div className="relative min-h-80 rounded-lg bg-default-100">
      {children}
      {status === 'rendering' && (
        <div className="absolute inset-0 flex items-center justify-center gap-2">
          <Spinner size="sm" />
          <span className="text-sm text-default-500">{t('rendering')}</span>
        </div>
      )}
      {/* A single, permanently-mounted live region rather than putting aria-live on the
          overlay above: the overlay unmounts on completion, so its own removal would never
          be announced. Staying mounted lets this announce both that a render has started
          and, via the text change below, that it has finished. */}
      <span className="sr-only" role="status" aria-live="polite">
        {status === 'rendering' ? t('rendering') : status === 'ready' ? t('renderReady') : ''}
      </span>
    </div>
  );
}
