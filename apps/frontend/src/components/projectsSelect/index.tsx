import { useProjectsServiceFindManyProjects } from '@attraccess/react-query-client';
import { Select } from '../select';

interface Props {
  value: number | undefined;
  onValueChange: (value: number | undefined) => void;
  label?: string;
  placeholder?: string;
}

export function ProjectsSelect(props: Props) {
  const { value, onValueChange } = props;

  const { data: projects, isLoading } = useProjectsServiceFindManyProjects();

  return (
    <Select
      items={(projects?.data ?? []).map((r) => ({ key: r.id.toString(), label: r.name }))}
      label={props.label}
      placeholder={projects?.data?.find((r) => r.id === value)?.name ?? props.placeholder}
      selectedKey={value ? value.toString() : ''}
      onSelectionChange={(key) => onValueChange(Number(key))}
      data-cy="projects-select"
      isLoading={isLoading}
    />
  );
}
