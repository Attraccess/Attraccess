// Domain mapping for the Flow node catalog: pure data + classification
// FEATURE: Node catalog redesign — domain grouping
import type { ComponentType, SVGProps } from 'react';
import { ResourceFlowNodeType } from '@attraccess/database-entities';
import {
  CircleDotIcon,
  CogIcon,
  DoorOpenIcon,
  GlobeIcon,
  HeartPulseIcon,
  MessageSquareIcon,
  ShuffleIcon,
} from 'lucide-react';

export type Domain = 'manual' | 'resource' | 'door' | 'mqtt' | 'http' | 'logic' | 'health';

export const DOMAIN_ORDER: Domain[] = ['manual', 'resource', 'door', 'mqtt', 'http', 'logic', 'health'];

interface DomainDef {
  color: string;
  iconBg: string;
  iconFg: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const DOMAINS: Record<Domain, DomainDef> = {
  manual:   { color: 'blue',   iconBg: 'bg-blue-100 dark:bg-blue-900/30',     iconFg: 'text-blue-700 dark:text-blue-300',     icon: CircleDotIcon },
  resource: { color: 'green',  iconBg: 'bg-green-100 dark:bg-green-900/30',   iconFg: 'text-green-700 dark:text-green-300',   icon: CogIcon },
  door:     { color: 'amber',  iconBg: 'bg-amber-100 dark:bg-amber-900/30',   iconFg: 'text-amber-700 dark:text-amber-300',   icon: DoorOpenIcon },
  mqtt:     { color: 'purple', iconBg: 'bg-purple-100 dark:bg-purple-900/30', iconFg: 'text-purple-700 dark:text-purple-300', icon: MessageSquareIcon },
  http:     { color: 'cyan',   iconBg: 'bg-cyan-100 dark:bg-cyan-900/30',     iconFg: 'text-cyan-700 dark:text-cyan-300',     icon: GlobeIcon },
  logic:    { color: 'slate',  iconBg: 'bg-slate-100 dark:bg-slate-800',      iconFg: 'text-slate-700 dark:text-slate-300',   icon: ShuffleIcon },
  health:   { color: 'rose',   iconBg: 'bg-rose-100 dark:bg-rose-900/30',     iconFg: 'text-rose-700 dark:text-rose-300',     icon: HeartPulseIcon },
};

export function schemaToDomain(nodeType: ResourceFlowNodeType): Domain {
  if (nodeType === ResourceFlowNodeType.INPUT_BUTTON) return 'manual';
  if (nodeType.includes('.resource.door.')) return 'door';
  if (nodeType.includes('.mqtt.')) return 'mqtt';
  if (nodeType.includes('.http.')) return 'http';
  if (nodeType.includes('.resource.health.')) return 'health';
  if (nodeType.includes('.resource.')) return 'resource';
  return 'logic';
}
