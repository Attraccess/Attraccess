// Accordion trigger row for a single domain: icon, label, count, chevron
// FEATURE: Node catalog redesign — domain header
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { getDomainDef, getPluginDomainLabel } from './domains';

interface Props {
  domain: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  tCatalog: TFunction;
}

export function CatalogDomainHeader({ domain, count, expanded, onToggle, tCatalog }: Props) {
  const def = getDomainDef(domain);
  const Icon = def.icon;
  const Chevron = expanded ? ChevronDownIcon : ChevronRightIcon;
  // Plugin domains supply their own label; static domains use i18n.
  const label = getPluginDomainLabel(domain) ?? tCatalog('domains.' + domain);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="w-full flex items-center gap-2 px-2 py-2 hover:bg-default-100 rounded-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    >
      <span className={`flex-none w-6 h-6 rounded flex items-center justify-center ${def.iconBg} ${def.iconFg}`}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      <span className="flex-1 text-sm font-semibold text-left">{label}</span>
      <span className="text-xs text-default-400">{count}</span>
      <Chevron className="w-4 h-4 text-default-400" />
    </button>
  );
}
