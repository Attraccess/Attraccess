import { useProjectsServiceFindManyProjects } from '@attraccess/react-query-client';
import { Select } from '../select';

const UNASSIGNED_KEY = '__unassigned__';

interface Props {
  value: number | null | undefined;
  onValueChange?: (value: number | undefined) => void;
  onChange?: (value: number | undefined) => void;
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  includeUnassignedOption?: boolean;
  unassignedLabel?: string;
  isDisabled?: boolean;
  includeArchived?: boolean;
}

export function ProjectsSelect(props: Props) {
  const { value, onValueChange, onChange, includeUnassignedOption, unassignedLabel, isDisabled, includeArchived, ...selectProps } = props;
  const handleChange = onValueChange ?? onChange ?? (() => undefined);

  const { data: projects } = useProjectsServiceFindManyProjects({
    includeArchived,
  });
  const resolvedValue = value ?? undefined;
  const projectItems = (projects?.data ?? []).map((project) => ({ key: project.id.toString(), label: project.name }));
  const items = includeUnassignedOption
    ? [{ key: UNASSIGNED_KEY, label: unassignedLabel ?? 'Unassigned' }, ...projectItems]
    : projectItems;

  return (
    <Select
      {...selectProps}
      items={items}
      placeholder={projects?.data?.find((r) => r.id === resolvedValue)?.name ?? props.placeholder}
      value={resolvedValue ? resolvedValue.toString() : ''}
      onChange={(key) => {
        if (key === UNASSIGNED_KEY || key === '') {
          handleChange(undefined);
          return;
        }
        const parsed = Number(key);
        handleChange(Number.isNaN(parsed) ? undefined : parsed);
      }}
      data-cy="projects-select"

      aria-label={props.ariaLabel ?? 'Projects Select'}
    />
  );
}
