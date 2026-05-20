// Catalog body: iterates domain groups, renders headers + rows
// FEATURE: Node catalog redesign — content assembly
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { CatalogDomainHeader } from './catalogDomainHeader';
import { CatalogRow } from './catalogRow';
import { CatalogGroup } from './useNodeCatalog';
import { Domain } from './domains';

interface Props {
  groups: CatalogGroup[];
  isDomainExpanded: (domain: Domain) => boolean;
  setDomainExpanded: (domain: Domain, next: boolean) => void;
  onSelect: (nodeType: string) => void;
  tCatalog: TFunction;
  tNodeTranslations: TFunction;
}

export function CatalogContent({
  groups,
  isDomainExpanded,
  setDomainExpanded,
  onSelect,
  tCatalog,
  tNodeTranslations,
}: Props) {
  if (groups.length === 0) {
    return <p className="text-sm text-default-500 px-2 py-4">{tCatalog('empty')}</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {groups.map((group) => {
        const expanded = isDomainExpanded(group.domain);
        return (
          <section key={group.domain}>
            <CatalogDomainHeader
              domain={group.domain}
              count={group.nodes.length}
              expanded={expanded}
              onToggle={() => setDomainExpanded(group.domain, !expanded)}
              tCatalog={tCatalog}
            />
            {expanded && (
              <div className="flex flex-col gap-0.5 pl-2 pb-2">
                {group.nodes.map((node) => (
                  <CatalogRow
                    key={node.schema.type}
                    node={node}
                    tNodeTranslations={tNodeTranslations}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
