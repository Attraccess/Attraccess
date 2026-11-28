import { useFindManyProjects } from '@attraccess/react-query-client';
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
  /** Projects that are listed but cannot be picked; `null` stands for the unassigned option. */
  disabledKeys?: ReadonlyArray<number | null>;
}

export function ProjectsSelect(props: Props) {
  const {
    value,
    onValueChange,
    onChange,
    includeUnassignedOption,
    unassignedLabel,
    isDisabled,
    includeArchived,
    disabledKeys,
    ...selectProps
  } = props;
  const handleChange = onValueChange ?? onChange ?? (() => undefined);

  const { data: projects } = useFindManyProjects({ query: { includeArchived } });
  const resolvedValue = value ?? undefined;
  // `null` is a chosen "unassigned", `undefined` is nothing chosen yet.
  const selectedKey = value === null && includeUnassignedOption ? UNASSIGNED_KEY : (resolvedValue?.toString() ?? '');
  const projectItems = (projects?.data ?? []).map((project) => ({ key: project.id.toString(), label: project.name }));
  const items = includeUnassignedOption
    ? [{ key: UNASSIGNED_KEY, label: unassignedLabel ?? 'Unassigned' }, ...projectItems]
    : projectItems;

  return (
    <Select
      {...selectProps}
      items={items}
      isDisabled={isDisabled}
      disabledKeys={disabledKeys?.map((key) => (key === null ? UNASSIGNED_KEY : key.toString()))}
      placeholder={projects?.data?.find((r) => r.id === resolvedValue)?.name ?? props.placeholder}
      value={selectedKey}
      onChange={(key) => {
        if (key === UNASSIGNED_KEY || key === '') {
          handleChange(undefined);
          return;
        }
        const parsed = Number(key);
        handleChange(Number.isNaN(parsed) ? undefined : parsed);
      }}
      data-cy="projects-select"
      // A visible label names the field; a second name would be read out in addition.
      aria-label={props.ariaLabel ?? (props.label ? undefined : 'Projects Select')}
    />
  );
}
