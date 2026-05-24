import { Link } from '@heroui/react';
import { ChevronRightIcon } from 'lucide-react';
import { LabeledSwitch } from '../../../components/labeledSwitch';

export interface ResourceGroupRowProps {
  groupId: number;
  groupName: string;
  description?: string;
  isAssigned: boolean;
  isPending: boolean;
  toggleLabel: string;
  openLabel: string;
  openHref: string;
  onToggle: () => void;
}

export function ResourceGroupRow({
  groupId,
  groupName,
  description,
  isAssigned,
  isPending,
  toggleLabel,
  openLabel,
  openHref,
  onToggle,
}: Readonly<ResourceGroupRowProps>) {
  const dotClass = isAssigned ? 'bg-success' : 'bg-default-300';
  const ringClass = isAssigned ? 'ring-success/30' : 'ring-default-300/30';

  return (
    <li
      data-cy={`resource-group-row-${groupId}`}
      data-assigned={isAssigned ? 'true' : 'false'}
      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-content2/40 hover:bg-content2 transition-colors"
    >
      <span
        aria-hidden
        className={`inline-block w-2.5 h-2.5 rounded-full ring-2 ${dotClass} ${ringClass}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate" title={groupName}>
          {groupName}
        </p>
        {description ? (
          <p className="text-xs text-default-500 truncate" title={description}>
            {description}
          </p>
        ) : null}
      </div>
      <LabeledSwitch
        size="sm"
        isSelected={isAssigned}
        isDisabled={isPending}
        onChange={onToggle}
        aria-label={toggleLabel}
        data-cy={`resource-group-row-${groupId}-switch`}
      />
      <Link
        href={openHref}
        className="text-xs inline-flex items-center gap-0.5"
        data-cy={`resource-group-row-${groupId}-open`}
        aria-label={`${openLabel}: ${groupName}`}
      >
        {openLabel}
        <ChevronRightIcon size={14} />
      </Link>
    </li>
  );
}
