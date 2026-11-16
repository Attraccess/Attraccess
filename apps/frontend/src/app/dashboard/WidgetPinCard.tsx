import { Component, ErrorInfo, PropsWithChildren, ReactNode } from 'react';
import { type DashboardWidgetRenderProps, PluginLiveUpdatesIdentityProvider } from '@attraccess/plugins-frontend-sdk';
import { StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import { CardHeading, PinCardProps, TileTitle } from './PinCards';
import { PinTile } from './SortablePinCard';
import { DashboardWidget } from './widgets/widgetsContext';
import dashboardDe from './de.json';
import dashboardEn from './en.json';
import de from './widgets/de.json';
import en from './widgets/en.json';

function CrashedWidget() {
  const { t } = useTranslations({ en, de });
  return <StatusAlert status="danger" title={t('crashed')} />;
}

/** Keeps a throwing widget inside its card, so the rest of the dashboard keeps working. */
class WidgetBoundary extends Component<
  PropsWithChildren<{ widgetId: string; pluginName?: string }>,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `Dashboard widget "${this.props.widgetId}"${this.props.pluginName ? ` of plugin "${this.props.pluginName}"` : ''} crashed`,
      error,
      info,
    );
  }

  render(): ReactNode {
    return this.state.failed ? <CrashedWidget /> : this.props.children;
  }
}

// Calls the widget's render function as a child of the boundary, so a render function that throws is caught too.
function Rendered({ render }: Readonly<{ render: () => ReactNode }>) {
  return <>{render()}</>;
}

function WidgetBody({ widget, props }: Readonly<{ widget: DashboardWidget; props: DashboardWidgetRenderProps }>) {
  const body = (
    // Keyed by size: a widget that crashed at one size gets another chance at the next.
    <WidgetBoundary key={props.size} widgetId={widget.id} pluginName={widget.plugin?.pluginName}>
      <Rendered render={() => widget.renderBody(props)} />
    </WidgetBoundary>
  );
  if (!widget.plugin) return body;
  return (
    <PluginLiveUpdatesIdentityProvider name={widget.plugin.manifestName}>{body}</PluginLiveUpdatesIdentityProvider>
  );
}

/** A widget: the host's header with icon, title and edit controls above the widget's own body at the tile's size. */
export function WidgetPinCard({
  id,
  widget,
  size,
  isEditing,
  isPreview = false,
  onRemove,
  onResize,
}: Readonly<PinCardProps & { widget: DashboardWidget }>) {
  const { t } = useTranslations({ en: dashboardEn, de: dashboardDe });
  const props: DashboardWidgetRenderProps = { size, isPreview };
  // Names the edit controls apart from those of the page with the same title, e.g. the Messages page.
  const label = t('card.widgetLabel', { title: widget.title });
  // The header extra is the widget's own content too, so it shares the boundary.
  const headerExtra = widget.renderHeaderExtra && (
    <WidgetBoundary key={size} widgetId={widget.id}>
      <Rendered render={() => widget.renderHeaderExtra?.({ ...props, isEditing })} />
    </WidgetBoundary>
  );

  return (
    <PinTile
      id={id}
      title={label}
      size={size}
      sizes={widget.sizes}
      isEditing={isEditing}
      isPreview={isPreview}
      surface={widget.hasFields ? 'section' : 'card'}
      onRemove={onRemove}
      onResize={onResize}
    >
      {(controls) => (
        <>
          <CardHeading
            controls={controls}
            stacked={size === 'small'}
            title={
              <TileTitle
                icon={widget.icon}
                title={widget.title}
                href={widget.href}
                isEditing={isEditing}
                data-cy={`dashboard-widget-${widget.id}`}
              />
            }
          >
            {headerExtra}
          </CardHeading>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <WidgetBody widget={widget} props={props} />
          </div>
        </>
      )}
    </PinTile>
  );
}
