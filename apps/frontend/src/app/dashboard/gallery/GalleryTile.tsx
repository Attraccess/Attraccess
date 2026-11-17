import { PropsWithChildren, ReactNode, useState } from 'react';
import { Button, Chip, cn, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { CheckIcon, DatabaseIcon, PlayIcon, PlusIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { CardHeading, PagePinCard, TileTitle } from '../PinCards';
import { PinnablePage } from '../pinnablePagesContext';
import { PinTile } from '../SortablePinCard';
import { TILE_ROWS_CLASSES, TILE_SIZES, TileSize, TileSizes } from '../sizes';
import { WidgetPinCard } from '../WidgetPinCard';
import { DashboardWidget } from '../widgets/widgetsContext';
import de from '../de.json';
import en from '../en.json';

const noop = () => undefined;

/**
 * Shows a tile exactly as on the dashboard: in two columns of the dashboard's row height, so small fills half the
 * width, medium all of it and large two rows. It is inert and hidden from assistive technology: the title and
 * description below say what it is, and nothing in it can be focused, pressed or navigated.
 */
export function PreviewFrame({ size, children }: Readonly<PropsWithChildren<{ size: TileSize }>>) {
  return (
    <div
      inert
      aria-hidden
      className={cn('pointer-events-none grid grid-cols-2', TILE_ROWS_CLASSES)}
      data-cy="dashboard-gallery-preview"
      data-size={size}
    >
      {children}
    </div>
  );
}

export function WidgetPreview({ widget, size }: Readonly<{ widget: DashboardWidget; size: TileSize }>) {
  return (
    <WidgetPinCard
      id={`preview:${widget.id}`}
      widget={widget}
      size={size}
      isEditing={false}
      isPreview
      onRemove={noop}
    />
  );
}

export function PagePreview({ page }: Readonly<{ page: PinnablePage }>) {
  return (
    <PagePinCard id={`preview:${page.path}`} page={page} size="small" isEditing={false} isPreview onRemove={noop} />
  );
}

/** A sample resource tile, standing for whichever resource the user chooses. */
export function ResourcePreview({ size }: Readonly<{ size: TileSize }>) {
  const { t } = useTranslations({ en, de });
  const status = (
    <Chip size="sm" color="success">
      {t('gallery.resource.sampleStatus')}
    </Chip>
  );

  return (
    <PinTile
      id="preview:resource"
      title={t('gallery.resource.sampleName')}
      size={size}
      isEditing={false}
      isPreview
      surface="section"
    >
      {(controls) =>
        size === 'small' ? (
          <div className="flex h-full flex-col items-start justify-between gap-1">
            {status}
            <span className="text-sm font-medium">{t('gallery.resource.sampleName')}</span>
          </div>
        ) : (
          <>
            <CardHeading
              controls={controls}
              title={
                <TileTitle
                  icon={<DatabaseIcon className="w-5 h-5" />}
                  title={t('gallery.resource.sampleName')}
                  isEditing={false}
                />
              }
            >
              {status}
            </CardHeading>
            <div className="flex flex-1 items-center justify-center">
              <Button variant="primary">
                <PlayIcon className="w-4 h-4" />
                {t('gallery.resource.sampleStart')}
              </Button>
            </div>
          </>
        )
      }
    </PinTile>
  );
}

/** The size selector of a gallery tile, shown when the item offers more than one size. */
export function SizeSelector({
  sizes,
  size,
  onChange,
}: Readonly<{ sizes: readonly TileSize[]; size: TileSize; onChange: (size: TileSize) => void }>) {
  const { t } = useTranslations({ en, de });
  if (sizes.length < 2) return null;

  return (
    <ToggleButtonGroup
      aria-label={t('gallery.sizeLabel')}
      size="sm"
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[size]}
      onSelectionChange={(keys) => {
        const next = [...keys][0] as TileSize | undefined;
        if (next) onChange(next);
      }}
      data-cy="dashboard-gallery-size"
    >
      {TILE_SIZES.filter((option) => sizes.includes(option)).map((option) => (
        <ToggleButton key={option} id={option}>
          {t(`sizes.${option}`)}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

/**
 * Add, or "Added" once the item is on the dashboard. "Added" stays focusable (aria-disabled, not disabled), so focus
 * stays on it after adding instead of falling back to the page. Both name the item, so a list of them stays apart.
 */
export function AddButton({
  label,
  addedLabel,
  isAdded,
  isDisabled,
  onAdd,
}: Readonly<{ label: string; addedLabel?: string; isAdded: boolean; isDisabled?: boolean; onAdd: () => void }>) {
  const { t } = useTranslations({ en, de });

  return (
    <Button
      size="sm"
      variant={isAdded ? 'ghost' : 'secondary'}
      aria-label={isAdded ? addedLabel : label}
      aria-disabled={isAdded || isDisabled || undefined}
      onPress={isAdded || isDisabled ? undefined : onAdd}
      data-cy="dashboard-picker-add"
      data-added={isAdded || undefined}
    >
      {isAdded ? <CheckIcon className="w-4 h-4" /> : <PlusIcon className="w-4 h-4" />}
      {isAdded ? t('gallery.added') : t('gallery.add')}
    </Button>
  );
}

/** A gallery tile: the live preview at the chosen size, title and description, the size choice and Add. */
export function GalleryTile({
  title,
  description,
  sizes,
  defaultSize,
  renderPreview,
  renderActions,
  'data-cy': dataCy,
}: Readonly<
  TileSizes & {
    title: string;
    description?: string;
    renderPreview: (size: TileSize) => ReactNode;
    /** The controls below the description; they receive the chosen size. */
    renderActions: (size: TileSize) => ReactNode;
    'data-cy'?: string;
  }
>) {
  const [size, setSize] = useState(defaultSize);

  return (
    <li className="flex min-w-0 flex-col gap-3" data-cy={dataCy}>
      <PreviewFrame size={size}>{renderPreview(size)}</PreviewFrame>
      <div className="flex min-w-0 flex-col gap-1">
        <h4 className="text-sm font-medium">{title}</h4>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <SizeSelector sizes={sizes} size={size} onChange={setSize} />
        {renderActions(size)}
      </div>
    </li>
  );
}
