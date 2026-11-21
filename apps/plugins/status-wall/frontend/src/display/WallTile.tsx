import { CheckIcon, PackageIcon, PowerIcon, WrenchIcon } from 'lucide-react';
import type { ComponentType, CSSProperties } from 'react';
import { imageSrc, type ResourceState, type WallTile as Tile } from '../api';
import { formatElapsed } from './elapsed';
import { TILE_ASPECT } from './fitGrid';

interface StateStyle {
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  /** Classes of the frame and status band. */
  tone: string;
}

export const STATE_STYLES: Record<ResourceState, StateStyle> = {
  ready: { icon: CheckIcon, tone: 'sw:bg-success sw:text-success-foreground sw:border-success' },
  'in-use': { icon: PowerIcon, tone: 'sw:bg-warning sw:text-warning-foreground sw:border-warning' },
  maintenance: { icon: WrenchIcon, tone: 'sw:bg-danger sw:text-danger-foreground sw:border-danger' },
};

interface Props {
  tile: Tile;
  width: number;
  now: Date;
  label: string;
}

/** One resource: its picture framed in its traffic-light colour, with name and state below. */
export function WallTile({ tile, width, now, label }: Readonly<Props>) {
  const style = STATE_STYLES[tile.state];
  const Icon = style.icon;
  const elapsed = formatElapsed(tile.since, now);
  // Everything scales with the tile, so the same wall reads well with 4 or 60 machines.
  const border = Math.max(3, Math.round(width * 0.03));
  const font = Math.max(12, Math.round(width * 0.075));
  const icon = Math.round(font * 1.3);

  return (
    <div
      className={`sw:flex sw:flex-col sw:overflow-hidden sw:rounded-2xl sw:border-solid ${style.tone}`}
      style={{ width, height: width / TILE_ASPECT, borderWidth: border }}
      aria-label={`${tile.name}: ${label}`}
      data-cy={`status-wall-tile-${tile.id}`}
      data-state={tile.state}
    >
      <div className="sw:relative sw:min-h-0 sw:flex-1 sw:bg-surface">
        {tile.imageUrl ? (
          <img
            src={imageSrc(tile.imageUrl)}
            alt=""
            className={`sw:h-full sw:w-full sw:object-cover ${tile.state === 'maintenance' ? 'sw:grayscale' : ''}`}
          />
        ) : (
          <div className="sw:flex sw:h-full sw:w-full sw:items-center sw:justify-center sw:text-muted">
            <PackageIcon style={{ width: width * 0.3, height: width * 0.3 }} />
          </div>
        )}
      </div>
      <div className="sw:flex sw:items-center sw:gap-2 sw:px-2" style={{ fontSize: font, paddingBlock: font * 0.3 }}>
        <Icon className="sw:shrink-0" style={{ width: icon, height: icon }} />
        <span className="sw:min-w-0 sw:flex-1 sw:truncate sw:font-bold sw:leading-tight">{tile.name}</span>
        {elapsed && (
          <span
            className="sw:shrink-0 sw:font-semibold sw:tabular-nums sw:opacity-80"
            style={{ fontSize: font * 0.75 }}
          >
            {elapsed}
          </span>
        )}
      </div>
    </div>
  );
}
