// Domain mapping for the Flow node catalog: pure data + classification
// FEATURE: Node catalog redesign — domain grouping
import type { ComponentType, SVGProps } from 'react';
import {
  ActivityIcon,
  BanknoteIcon,
  DoorOpenIcon,
  GlobeIcon,
  HeartPulseIcon,
  MonitorIcon,
  MessageSquareIcon,
  PuzzleIcon,
  ShuffleIcon,
  TimerIcon,
} from 'lucide-react';

// Static (core) domains only — plugin domains are derived at runtime from node types.
export type Domain =
  | 'usage-sessions'
  | 'operation-activity'
  | 'billing'
  | 'access-doors'
  | 'health-monitoring'
  | 'companion-device'
  | 'messaging'
  | 'web-requests'
  | 'flow-control';

export const DOMAIN_ORDER: Domain[] = [
  'usage-sessions',
  'operation-activity',
  'billing',
  'access-doors',
  'health-monitoring',
  'companion-device',
  'messaging',
  'web-requests',
  'flow-control',
];

interface DomainDef {
  color: string;
  iconBg: string;
  iconFg: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const DOMAINS: Record<Domain, DomainDef> = {
  'usage-sessions': {
    color: 'blue',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconFg: 'text-blue-700 dark:text-blue-300',
    icon: TimerIcon,
  },
  'operation-activity': {
    color: 'green',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconFg: 'text-green-700 dark:text-green-300',
    icon: ActivityIcon,
  },
  billing: {
    color: 'yellow',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconFg: 'text-yellow-700 dark:text-yellow-300',
    icon: BanknoteIcon,
  },
  'access-doors': {
    color: 'amber',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconFg: 'text-amber-700 dark:text-amber-300',
    icon: DoorOpenIcon,
  },
  'health-monitoring': {
    color: 'rose',
    iconBg: 'bg-rose-100 dark:bg-rose-900/30',
    iconFg: 'text-rose-700 dark:text-rose-300',
    icon: HeartPulseIcon,
  },
  'companion-device': {
    color: 'indigo',
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
    iconFg: 'text-indigo-700 dark:text-indigo-300',
    icon: MonitorIcon,
  },
  messaging: {
    color: 'purple',
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    iconFg: 'text-purple-700 dark:text-purple-300',
    icon: MessageSquareIcon,
  },
  'web-requests': {
    color: 'cyan',
    iconBg: 'bg-cyan-100 dark:bg-cyan-900/30',
    iconFg: 'text-cyan-700 dark:text-cyan-300',
    icon: GlobeIcon,
  },
  'flow-control': {
    color: 'slate',
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    iconFg: 'text-slate-700 dark:text-slate-300',
    icon: ShuffleIcon,
  },
};

// ponytail: all plugin.* domains share one visual style; no per-plugin config needed.
const PLUGIN_DEF: DomainDef = {
  color: 'orange',
  iconBg: 'bg-orange-100 dark:bg-orange-900/30',
  iconFg: 'text-orange-700 dark:text-orange-300',
  icon: PuzzleIcon,
};

/** Returns the DomainDef for any domain key, including dynamic plugin.{name} domains. */
export function getDomainDef(domain: string): DomainDef {
  return (DOMAINS as Record<string, DomainDef>)[domain] ?? PLUGIN_DEF;
}

/**
 * For plugin domains (e.g. "plugin.shelly") returns a capitalised label ("Shelly").
 * Returns null for static core domains — let the caller use its translation key instead.
 */
export function getPluginDomainLabel(domain: string): string | null {
  if (!domain.startsWith('plugin.')) return null;
  const name = domain.slice('plugin.'.length);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Maps a node type string to its catalog domain key.
 * Plugin nodes map to "plugin.{pluginName}" so each plugin gets its own catalog section.
 */
export function nodeTypeDomain(nodeType: string): string {
  if (nodeType.startsWith('plugin.')) {
    // plugin.shelly.send-on → 'plugin.shelly'
    const parts = nodeType.split('.');
    return parts.length >= 2 ? `plugin.${parts[1]}` : 'plugin';
  }
  if (nodeType.includes('.usage.')) return 'usage-sessions';
  if (nodeType.includes('.activity.')) return 'operation-activity';
  if (nodeType.includes('.billing.')) return 'billing';
  if (nodeType.includes('.door.')) return 'access-doors';
  if (nodeType.includes('.health.')) return 'health-monitoring';
  if (nodeType.includes('.companion.')) return 'companion-device';
  if (nodeType.includes('.mqtt.')) return 'messaging';
  if (nodeType.includes('.http.')) return 'web-requests';
  return 'flow-control';
}
