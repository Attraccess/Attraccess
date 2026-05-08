import { Button, ButtonGroup, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/react';
import { ChevronDownIcon, PlayIcon } from 'lucide-react';
import { ProjectsSelect } from '../../../../../components/projectsSelect';
import { TFunction } from '@attraccess/plugins-frontend-ui';

interface MachineStartControlsProps {
  t: TFunction;
  selectedProjectId?: number;
  onProjectChange: (projectId: number | undefined) => void;
  onStart: () => void;
  onStartWithNotes: () => void;
  isStarting: boolean;
}

export function MachineStartControls({
  t,
  selectedProjectId,
  onProjectChange,
  onStart,
  onStartWithNotes,
  isStarting,
}: MachineStartControlsProps) {
  return (
    <>
      <p className="text-gray-500 dark:text-gray-400">{t('machine.noActiveSession')}</p>
      <ProjectsSelect
        value={selectedProjectId}
        onValueChange={onProjectChange}
        label={t('machine.project.label')}
        placeholder={t('machine.project.placeholder')}
      />
      <ButtonGroup fullWidth color="primary">
        <Button isLoading={isStarting} startContent={<PlayIcon className="w-4 h-4" />} onPress={onStart}>
          {t('machine.startSession')}
        </Button>
        <Dropdown placement="bottom-end">
          <DropdownTrigger>
            <Button isIconOnly>
              <ChevronDownIcon />
            </Button>
          </DropdownTrigger>
          <DropdownMenu disallowEmptySelection aria-label={t('machine.alternativeStartSessionOptionsMenu.label')}>
            <DropdownItem
              key="startWithNotes" id="startWithNotes"
              description={t('machine.alternativeStartSessionOptionsMenu.startWithNotes.description')}
              onPress={onStartWithNotes}
            >
              {t('machine.alternativeStartSessionOptionsMenu.startWithNotes.label')}
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </ButtonGroup>
    </>
  );
}
