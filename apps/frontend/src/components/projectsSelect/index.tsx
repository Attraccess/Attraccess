import { useProjectsServiceFindManyProjects } from '@attraccess/react-query-client';
import { Select } from '../select';

const UNASSIGNED_KEY = '__unassigned__';

interface Props {
  value: number | null | undefined;
  onValueChange: (value: number | undefined) => void;
  label?: string;
  placeholder?: string;
  includeUnassignedOption?: boolean;
  unassignedLabel?: string;
  isDisabled?: boolean;
}

export function ProjectsSelect(props: Props) {
  const { value, onValueChange, includeUnassignedOption, unassignedLabel, isDisabled } = props;

  const { data: projects, isLoading } = useProjectsServiceFindManyProjects();
  const resolvedValue = value ?? undefined;
  const projectItems = (projects?.data ?? []).map((project) => ({ key: project.id.toString(), label: project.name }));
  const items = includeUnassignedOption
    ? [{ key: UNASSIGNED_KEY, label: unassignedLabel ?? 'Unassigned' }, ...projectItems]
    : projectItems;

  return (
    <Select
      items={items}
      label={props.label}
      placeholder={projects?.data?.find((r) => r.id === resolvedValue)?.name ?? props.placeholder}
      selectedKey={resolvedValue ? resolvedValue.toString() : ''}
      onSelectionChange={(key) => {
        if (key === UNASSIGNED_KEY || key === '') {
          onValueChange(undefined);
          return;
        }

        const parsed = Number(key);
        onValueChange(Number.isNaN(parsed) ? undefined : parsed);
      }}
      data-cy="projects-select"
      isLoading={isLoading}
      isDisabled={isDisabled}
    />
  );
}
