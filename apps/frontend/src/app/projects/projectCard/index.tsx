import { Project } from '@attraccess/react-query-client';
import { Card, CardBody, CardFooter, Image, Link } from '@heroui/react';
import { filenameToUrl } from '../../../api';

interface Props {
  project: Project;
}

export function ProjectCard(props: Props) {
  const { project } = props;

  return (
    <Card isPressable shadow="sm" as={Link} href={`/projects/${project.id}`}>
      <CardBody className="overflow-visible p-0">
        <Image
          alt={project.name}
          className="w-full object-cover h-[240px] hover:object-contain transition-all duration-300"
          radius="lg"
          shadow="sm"
          src={filenameToUrl(project.logo)}
          width="100%"
        />
      </CardBody>
      <CardFooter className="flex-col items-start justify-start gap-2">
        <b className="text-ellipsis overflow-hidden line-clamp-1">{project.name}</b>
        <p className="text-small leading-5 text-default-500 text-ellipsis overflow-hidden line-clamp-2 min-h-[2.5rem]">
          {project.description}
        </p>
      </CardFooter>
    </Card>
  );
}
