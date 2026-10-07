import { Button, ModalBody, ModalHeader, ModalHeading } from '@heroui/react';
import { StandardModal } from '../../../../../../../components/standardModal';
import { MqttServerSelect } from '../../../../../../../components/mqttServerSelect';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { CreateMqttServerForm } from '../../../../../../mqtt/servers/CreateMqttServerPage';
import { PropertyViewProps } from './index.property-view-props';

export function MqttPropertyInput<TValue>(props: PropertyViewProps<TValue>) {
  const { value, isRequired, hideLabel, label, onChange, tNodeTranslations: t } = props;
  const [isCreateServerOpen, setIsCreateServerOpen] = useState(false);
  return (
    <>
      <div className="flex gap-2 w-full items-center">
        <div className="flex-grow min-w-0">
          <MqttServerSelect
            selectedId={value as number}
            onSelectionChange={(id) => onChange(id as TValue)}
            label={!hideLabel ? label : undefined}
            ariaLabel={label}
            isRequired={isRequired}
            className="w-full"
          />
        </div>
        <Button
          variant="secondary"
          onPress={() => setIsCreateServerOpen(true)}
          data-cy="mqtt-server-select-create-button"
          isIconOnly
          className="h-full min-h-[48px] aspect-square"
        >
          <PlusIcon size={18} />
        </Button>
      </div>

      <StandardModal isOpen={isCreateServerOpen} onOpenChange={setIsCreateServerOpen} size="md">
        {({ close }) => (
          <>
            <ModalHeader>
              <ModalHeading>{t('nodes.genericConfig.createMqttServer')}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <CreateMqttServerForm
                onSuccess={(server) => {
                  onChange(server.id as TValue);
                  setIsCreateServerOpen(false);
                }}
                onCancel={() => {
                  setIsCreateServerOpen(false);
                  close();
                }}
              />
            </ModalBody>
          </>
        )}
      </StandardModal>
    </>
  );
}
