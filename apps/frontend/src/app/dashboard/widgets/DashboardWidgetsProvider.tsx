import { PropsWithChildren, useEffect, useMemo, useRef, useState } from 'react';
import { PuzzleIcon } from 'lucide-react';
import { useTranslations, useTranslationState } from '@attraccess/plugins-frontend-ui';
import { useLicenseServiceGetLicenseInformation } from '@attraccess/react-query-client';
import type { DashboardWidgetSize, PluginDashboardWidget } from '@attraccess/plugins-frontend-sdk';
import { useAuth } from '../../../hooks/useAuth';
import usePluginState from '../../plugins/plugin.state';
import { useCanOpenPage } from './access';
import { BUILT_IN_WIDGETS } from './builtInWidgets';
import { pluginGalleryGroupId, pluginGroupTitle } from './groups';
import { BUILT_IN_WIDGET_IDS } from './ids';
import { TILE_SIZES } from '../sizes';
import { DashboardWidget, DashboardWidgets, DashboardWidgetsContext } from './widgetsContext';
import de from './de.json';
import en from './en.json';

const BUILT_IN_IDS = new Set<string>(BUILT_IN_WIDGET_IDS);

const isSize = (value: unknown): value is DashboardWidgetSize => TILE_SIZES.includes(value as DashboardWidgetSize);

/** A plugin's sizes, default size and gallery group, with the SDK's defaults for what it leaves out. */
function pluginWidgetLayout(widget: PluginDashboardWidget, manifestName: string, pluginGroup: string) {
  const declared = Array.isArray(widget.sizes) ? TILE_SIZES.filter((size) => widget.sizes?.includes(size)) : [];
  const sizes = declared.length ? declared : (['medium'] as DashboardWidgetSize[]);
  const defaultSize = isSize(widget.defaultSize) && sizes.includes(widget.defaultSize) ? widget.defaultSize : sizes[0];
  // The plugin's group, unless the widget names another one.
  const group =
    !widget.group || widget.group === pluginGroup
      ? { id: pluginGalleryGroupId(manifestName), title: pluginGroup }
      : { id: `group:${widget.group}`, title: widget.group };
  return { sizes, defaultSize, group };
}

/**
 * Widgets of active plugins: those a plugin returns from getDashboardWidgets() and lists in its manifest's
 * `dashboardWidgets`. A built-in id always wins, and the first plugin wins an id two plugins claim.
 */
function usePluginWidgets(): DashboardWidget[] {
  const plugins = usePluginState((state) => state.plugins);
  const { user } = useAuth();
  const language = useTranslationState((state) => state.language);
  // Plugins decide per account (permissions, language) and may report a change of their own, e.g. after an async check.
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const unsubscribe = plugins.map((manifest) => {
      try {
        return manifest.plugin.onDashboardWidgetsChange?.(() => setRevision((current) => current + 1));
      } catch (error) {
        console.error(`Attraccess Plugin System: onDashboardWidgetsChange() of plugin "${manifest.name}" threw`, error);
        return undefined;
      }
    });
    return () => unsubscribe.forEach((stop) => (typeof stop === 'function' ? stop() : undefined));
  }, [plugins]);
  // The plugin provider passes plugins the signed-in user in an effect, after this render asked them. Ask again then.
  const userId = user?.id;
  useEffect(() => setRevision((current) => current + 1), [plugins, userId]);

  return useMemo(() => {
    const seen = new Set<string>();
    return plugins.flatMap((manifest) => {
      const pluginName = manifest.plugin.getPluginName();
      const declared = new Set(manifest.main.frontend?.dashboardWidgets ?? []);
      let offered: unknown;
      try {
        offered = manifest.plugin.getDashboardWidgets?.() ?? [];
      } catch (error) {
        console.error(`Attraccess Plugin System: getDashboardWidgets() of plugin "${pluginName}" threw`, error);
        return [];
      }
      if (!Array.isArray(offered)) {
        console.error(`Attraccess Plugin System: getDashboardWidgets() of plugin "${pluginName}" returned no array`);
        return [];
      }
      // The plugin's group is named by its first widget that names one.
      const pluginGroup =
        (offered as PluginDashboardWidget[]).find((widget) => typeof widget?.group === 'string' && widget.group)
          ?.group ?? pluginGroupTitle(manifest.name);
      return (offered as PluginDashboardWidget[]).flatMap((widget): DashboardWidget[] => {
        if (typeof widget?.render !== 'function' || !declared.has(widget.id) || seen.has(widget.id)) return [];
        if (BUILT_IN_IDS.has(widget.id)) {
          console.warn(`Attraccess Plugin System: plugin "${pluginName}" offers the built-in widget id "${widget.id}"`);
          return [];
        }
        seen.add(widget.id);
        return [
          {
            id: widget.id,
            title: widget.title,
            description: widget.description,
            icon: widget.icon ?? <PuzzleIcon className="w-5 h-5" aria-hidden />,
            ...pluginWidgetLayout(widget, manifest.name, pluginGroup),
            keywords: Array.isArray(widget.keywords) ? widget.keywords : undefined,
            href: typeof widget.href === 'string' ? widget.href : undefined,
            hasFields: widget.hasFields,
            renderBody: (props) => widget.render(props),
            plugin: { pluginName, manifestName: manifest.name },
          },
        ];
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user, language and revision make the plugins answer anew.
  }, [plugins, userId, language, revision]);
}

function useComputedDashboardWidgets(): DashboardWidgets {
  const { t } = useTranslations({ en, de });
  const { isAuthenticated } = useAuth();
  // The provider also wraps the logged-out pages of the layout, where the license cannot be read.
  const { data: license } = useLicenseServiceGetLicenseInformation(undefined, { enabled: isAuthenticated });
  const arePluginsInitialized = usePluginState((state) => state.isInitialized);
  const canOpen = useCanOpenPage();
  const pluginWidgets = usePluginWidgets();
  // A plugin widget that is gone keeps the title it last had, so its placeholder stays recognisable.
  const pluginTitles = useRef(new Map<string, string>());
  pluginWidgets.forEach((widget) => pluginTitles.current.set(widget.id, widget.title));

  return useMemo(() => {
    const builtIns = BUILT_IN_WIDGETS.filter((widget) => canOpen(widget.page)).map(
      ({ id, icon: Icon, page, group, sizes, defaultSize, hasFields, Body, HeaderExtra }): DashboardWidget => ({
        id,
        title: t(`${id}.title`),
        description: t(`${id}.description`),
        icon: <Icon className="w-5 h-5" aria-hidden />,
        group: { id: group, title: t(`groups.${group}`) },
        keywords: t(`${id}.keywords`).split(',').map((keyword) => keyword.trim()),
        href: page,
        sizes,
        defaultSize,
        hasFields,
        renderHeaderExtra: HeaderExtra && ((props) => <HeaderExtra {...props} />),
        renderBody: (props) => <Body {...props} />,
      }),
    );

    return {
      widgets: [...builtIns, ...pluginWidgets],
      titleOf: (id: string) => (BUILT_IN_IDS.has(id) ? t(`${id}.title`) : pluginTitles.current.get(id)),
      isReady: !!license && arePluginsInitialized,
    };
  }, [t, canOpen, pluginWidgets, license, arePluginsInitialized]);
}

export function DashboardWidgetsProvider({ children }: PropsWithChildren) {
  const widgets = useComputedDashboardWidgets();
  return <DashboardWidgetsContext.Provider value={widgets}>{children}</DashboardWidgetsContext.Provider>;
}
