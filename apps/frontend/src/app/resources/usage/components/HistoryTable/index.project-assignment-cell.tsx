import { ProjectsSelect } from '../../../../../components/projectsSelect';
import type { ProjectAssignmentCellProps } from './index.contracts';

export const ProjectAssignmentCell = ({
  session,
  canEdit,
  projectId,
  isUpdating,
  placeholder,
  unassignedLabel,
  onChange,
}: ProjectAssignmentCellProps) => {
  if (!canEdit) {
    return <span>{session.project?.name ?? placeholder}</span>;
  }

  return (
    <div onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <ProjectsSelect
        value={projectId ?? undefined}
        onChange={onChange}
        placeholder={placeholder}
        includeUnassignedOption
        unassignedLabel={unassignedLabel}
        isDisabled={isUpdating}
      />
    </div>
  );
};
