import { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import { Button, Form, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure } from '@heroui/react';
import { useNodeId, useNodesData } from '@xyflow/react';
import { PageHeader } from '../../../../../../components/pageHeader';
import { TFunction } from 'i18next';
import { useFlowContext } from '../../flowContext';
import { Property, PropertyInput } from './property-input';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  schema: ResourceFlowNodeSchemaDto;
  children: (onOpen: () => void) => React.ReactNode;
  tNodeTranslations: TFunction;
}

export function NodeEditor(props: Props) {
  const { tNodeTranslations: t, schema } = props;
  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();

  const nodeId = useNodeId();
  const currentData = useNodesData(nodeId as string);
  const { updateNodeData } = useFlowContext();
  const formRef = useRef<HTMLFormElement>(null);

  const [data, setData] = useState<Record<string, unknown>>(currentData?.data ?? {});

  useEffect(() => {
    setData(currentData?.data ?? {});
  }, [currentData]);

  const onSave = useCallback(() => {
    if (!formRef.current) {
      return;
    }
    if (!formRef.current.checkValidity()) {
      return;
    }

    updateNodeData(nodeId as string, data);
    onClose();
  }, [nodeId, data, updateNodeData, onClose]);

  const onInputChange = useCallback((propertyName: string, value: unknown) => {
    console.log('onInputChange', propertyName, value);
    setData((prev) => ({ ...prev, [propertyName]: value }));
  }, []);

  return (
    <>
      {props.children(onOpen)}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          <ModalHeader>
            <PageHeader
              title={t('nodes.' + schema.type + '.title')}
              subtitle={t('nodes.' + schema.type + '.description')}
              noMargin
            />
          </ModalHeader>

          <ModalBody className="flex flex-col gap-2">
            <Form onSubmit={onSave} ref={formRef}>
              {Object.entries(schema.configSchema.properties as Record<string, Property<unknown>>).map(
                ([propertyName, property]) => (
                  <PropertyInput
                    isRequired={(schema.configSchema.required as string[])?.includes(propertyName)}
                    nodeType={schema.type}
                    tNodeTranslations={t}
                    name={propertyName}
                    schema={property}
                    value={data[propertyName]}
                    onChange={(value) => onInputChange(propertyName, value)}
                  />
                ),
              )}
              <input hidden type="submit" />
            </Form>
          </ModalBody>

          <ModalFooter>
            <Button color="primary" onPress={onSave}>
              {t('editor.buttons.save')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
