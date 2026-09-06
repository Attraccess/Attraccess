// Single node row inside the catalog: icon, name, description, direction glyph
// FEATURE: Node catalog redesign — row presentation
import type { DragEvent } from 'react';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from 'lucide-react';
import { CatalogNode, Direction } from './useNodeCatalog';
import { getDomainDef, nodeTypeDomain } from './domains';

interface Props {
  node: CatalogNode;
  tNodeTranslations: TFunction;
  onSelect: (nodeType: string) => void;
}

const DIRECTION_ICON: Record<Direction, { icon: typeof ArrowDownIcon; label: string }> = {
  down: { icon: ArrowDownIcon, label: 'trigger' },
  up: { icon: ArrowUpIcon, label: 'action' },
  both: { icon: ArrowUpDownIcon, label: 'both' },
};

export function CatalogRow({ node, tNodeTranslations, onSelect }: Props) {
  const domain = nodeTypeDomain(node.schema.type);
  const def = getDomainDef(domain);
  const Icon = def.icon;
  const { icon: DirIcon, label: dirLabel } = DIRECTION_ICON[node.direction];

  const handleDragStart = (e: DragEvent<HTMLButtonElement>) => {
    e.dataTransfer.setData('application/reactflow', node.schema.type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <button
      type="button"
      draggable
      onClick={() => onSelect(node.schema.type)}
      onDragStart={handleDragStart}
      className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-default-100 active:bg-default-200 transition-colors text-left cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    >
      <span className={`flex-none w-8 h-8 rounded-md flex items-center justify-center ${def.iconBg} ${def.iconFg}`}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium truncate">
          {node.schema.label ?? tNodeTranslations('nodes.' + node.schema.type + '.title')}
        </span>
        <span className="block text-xs text-muted truncate">
          {node.schema.description ?? tNodeTranslations('nodes.' + node.schema.type + '.description')}
        </span>
      </span>
      <span aria-label={dirLabel} className="flex-none text-muted">
        <DirIcon className="w-4 h-4" />
      </span>
    </button>
  );
}
