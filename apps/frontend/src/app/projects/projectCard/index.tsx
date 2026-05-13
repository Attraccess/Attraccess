import { Project } from '@attraccess/react-query-client';
import { Card, Chip, Link } from '@heroui/react';
import { filenameToUrl } from '../../../api';

interface Props {
  project: Project;
  archivedLabel?: string;
}

export function ProjectCard(props: Props) {
  const { project, archivedLabel } = props;

  return (
    <Link href={`/projects/${project.id}`} className="block"><Card>
      <Card.Content className="overflow-visible p-0">
        <img
          alt={project.name}
          className="w-full object-cover h-[240px] hover:object-contain transition-all duration-300 rounded-lg shadow-sm"
          src={filenameToUrl(project.logo) || '/project-no-thumbnail.svg'}
        />
      </Card.Content>
      <Card.Footer className="flex-col items-start justify-start gap-2">
        <div className="flex w-full items-center justify-between gap-2">
          <b className="text-ellipsis overflow-hidden line-clamp-1">{project.name}</b>
          {project.archivedAt && (
            <Chip variant="soft" color="warning">
              {archivedLabel ?? 'Archived'}
            </Chip>
          )}
        </div>
        <p className="text-small leading-5 text-default-500 text-ellipsis overflow-hidden line-clamp-2 min-h-[2.5rem]">
          {project.description}
        </p>
      </Card.Footer>
    </Card></Link>
  );
}
