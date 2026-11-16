import { Component, ErrorInfo, PropsWithChildren, ReactNode } from 'react';
import { Card } from '@heroui/react';
import { PluginLiveUpdatesIdentityProvider } from '@attraccess/plugins-frontend-sdk';
import { StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import { CardHeading, PinCardProps } from './PinCards';
import { SortablePinCard, SortablePinSection } from './SortablePinCard';
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

function WidgetBody({ widget }: Readonly<{ widget: DashboardWidget }>) {
  const body = (
    <WidgetBoundary widgetId={widget.id} pluginName={widget.plugin?.pluginName}>
      <Rendered render={widget.renderBody} />
    </WidgetBoundary>
  );
  if (!widget.plugin) return body;
  return (
    <PluginLiveUpdatesIdentityProvider name={widget.plugin.manifestName}>{body}</PluginLiveUpdatesIdentityProvider>
  );
}

/** A widget: the host's header with icon, title and edit controls around the widget's own body. */
export function WidgetPinCard({
  id,
  widget,
  isEditing,
  onRemove,
}: Readonly<PinCardProps & { widget: DashboardWidget }>) {
  const { t } = useTranslations({ en: dashboardEn, de: dashboardDe });
  // Names the edit controls apart from those of the page with the same title, e.g. the Messages page.
  const label = t('card.widgetLabel', { title: widget.title });
  // The header extra is the widget's own content too, so it shares the boundary.
  const headerExtra = widget.renderHeaderExtra && (
    <WidgetBoundary widgetId={widget.id}>
      <Rendered render={widget.renderHeaderExtra} />
    </WidgetBoundary>
  );

  if (widget.hasFields) {
    return (
      <SortablePinSection id={id} title={label} isEditing={isEditing} onRemove={onRemove}>
        {(controls) => (
          <>
            <header className="flex flex-row items-center gap-3" data-cy={`dashboard-widget-${widget.id}`}>
              {controls.dragHandle}
              {widget.icon}
              <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{widget.title}</h3>
              {headerExtra}
              {controls.removeButton}
            </header>
            <WidgetBody widget={widget} />
          </>
        )}
      </SortablePinSection>
    );
  }

  return (
    <SortablePinCard id={id} title={label} isEditing={isEditing} onRemove={onRemove}>
      {(controls) => (
        <>
          <CardHeading
            controls={controls}
            title={
              <>
                {widget.icon}
                <Card.Title className="truncate" data-cy={`dashboard-widget-${widget.id}`}>
                  {widget.title}
                </Card.Title>
              </>
            }
          >
            {headerExtra}
          </CardHeading>
          <Card.Content>
            <WidgetBody widget={widget} />
          </Card.Content>
        </>
      )}
    </SortablePinCard>
  );
}
