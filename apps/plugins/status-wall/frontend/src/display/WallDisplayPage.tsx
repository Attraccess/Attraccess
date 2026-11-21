import { Spinner } from '@heroui/react';
import { LinkIcon, WifiOffIcon } from 'lucide-react';
import { useParams } from 'react-router-dom';
import type { ResourceState } from '../api';
import { useStatusWallTranslations } from '../i18n';
import { useFitGrid } from './useFitGrid';
import { useNow } from './useNow';
import { useWakeLock } from './useWakeLock';
import { useWallSnapshot } from './useWallSnapshot';
import { STATE_STYLES, WallTile } from './WallTile';

const GAP = 16;
const STATES: ResourceState[] = ['ready', 'in-use', 'maintenance'];

/** Toggles full screen, for a screen set up with a mouse: double-click anywhere. */
const toggleFullscreen = () => {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
};

/** The public full-screen wall: every resource as a picture in its traffic-light colour, fitted to the screen. */
export function WallDisplayPage() {
  const { token = '' } = useParams();
  const { t, language } = useStatusWallTranslations();
  const wall = useWallSnapshot(token);
  const now = useNow(15_000);
  const tiles = wall.data?.tiles ?? [];
  const grid = useFitGrid(tiles.length, GAP);
  useWakeLock();

  if (wall.gone) {
    return (
      <div
        className="sw:flex sw:h-dvh sw:flex-col sw:items-center sw:justify-center sw:gap-4 sw:bg-background sw:p-8 sw:text-center sw:text-foreground"
        data-cy="status-wall-gone"
      >
        <LinkIcon className="sw:h-16 sw:w-16 sw:text-muted" />
        <p className="sw:text-3xl sw:font-bold">{t('display.gone.title')}</p>
        <p className="sw:text-xl sw:text-muted">{t('display.gone.body')}</p>
      </div>
    );
  }

  const counts = STATES.map((state) => ({ state, count: tiles.filter((tile) => tile.state === state).length }));
  const offline = wall.isError && wall.data !== undefined;

  return (
    <div
      className="sw:flex sw:h-dvh sw:flex-col sw:gap-4 sw:overflow-hidden sw:bg-background sw:p-4 sw:text-foreground"
      onDoubleClick={toggleFullscreen}
      data-cy="status-wall"
    >
      <header className="sw:flex sw:flex-wrap sw:items-center sw:gap-x-6 sw:gap-y-2">
        <h1 className="sw:min-w-0 sw:flex-1 sw:truncate sw:text-3xl sw:font-bold">{wall.data?.name ?? ''}</h1>
        <div className="sw:flex sw:items-center sw:gap-3">
          {counts.map(({ state, count }) => {
            const Icon = STATE_STYLES[state].icon;
            return (
              <span
                key={state}
                className={`sw:flex sw:items-center sw:gap-2 sw:rounded-full sw:px-4 sw:py-1 sw:text-2xl sw:font-bold ${STATE_STYLES[state].tone}`}
                title={t(`state.${state}`)}
                data-cy={`status-wall-count-${state}`}
              >
                <Icon className="sw:h-6 sw:w-6" />
                <span className="sw:tabular-nums">{count}</span>
              </span>
            );
          })}
        </div>
        {offline && (
          <span title={t('display.offline')} data-cy="status-wall-offline">
            <WifiOffIcon className="sw:h-7 sw:w-7 sw:text-danger" aria-label={t('display.offline')} />
          </span>
        )}
        <time className="sw:text-3xl sw:font-semibold sw:tabular-nums">
          {now.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}
        </time>
      </header>

      <main ref={grid.ref} className="sw:flex sw:min-h-0 sw:flex-1 sw:items-center sw:justify-center">
        {wall.isPending ? (
          <Spinner size="lg" />
        ) : tiles.length === 0 ? (
          <p className="sw:text-2xl sw:text-muted" data-cy="status-wall-empty">
            {t('display.empty')}
          </p>
        ) : (
          <div
            className="sw:grid sw:justify-center"
            style={{ gap: GAP, gridTemplateColumns: `repeat(${grid.columns}, ${grid.tileWidth}px)` }}
          >
            {tiles.map((tile) => (
              <WallTile key={tile.id} tile={tile} width={grid.tileWidth} now={now} label={t(`state.${tile.state}`)} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
