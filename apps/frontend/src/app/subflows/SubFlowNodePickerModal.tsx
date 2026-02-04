import {
  Accordion,
  AccordionItem,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
} from '@heroui/react';
import { useCallback, useMemo } from 'react';
import { TFunction, useTranslations } from '@attraccess/plugins-frontend-ui';
import { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import { AttraccessNode } from '../resources/details/flows/node';
import { useSubFlowNodeSchemas } from './api';
import nodePickerDe from '../resources/details/flows/nodePickerModal/de.json';
import nodePickerEn from '../resources/details/flows/nodePickerModal/en.json';

interface Props {
  onSelect: (nodeType: string) => void;
  children: (open: () => void) => React.ReactNode;
  tNodeTranslations: TFunction;
}

interface NodeGroup {
  nodes: ResourceFlowNodeSchemaDto[];
  category: 'input' | 'output' | 'processing';
}

export function SubFlowNodePickerModal(props: Props) {
  const { isOpen, onOpenChange, onClose, onOpen } = useDisclosure();

  const { t } = useTranslations({
    de: nodePickerDe,
    en: nodePickerEn,
  });

  const { data: nodeSchemas } = useSubFlowNodeSchemas();

  const nodeGroups = useMemo((): NodeGroup[] => {
    const inputsGroup: NodeGroup = { category: 'input', nodes: [] };
    const processingGroup: NodeGroup = { category: 'processing', nodes: [] };
    const outputsGroup: NodeGroup = { category: 'output', nodes: [] };

    const groups = [inputsGroup, processingGroup, outputsGroup];

    if (!nodeSchemas) {
      return groups;
    }

    nodeSchemas.forEach((schema) => {
      if (!schema.supportedByResource) {
        return;
      }

      if (schema.isOutput) {
        outputsGroup.nodes.push(schema);
        return;
      }

      const isInput = schema.inputs.length === 0 && schema.outputs.length > 0;
      if (isInput) {
        inputsGroup.nodes.push(schema);
        return;
      }

      const isProcessing = schema.inputs.length > 0 && schema.outputs.length > 0;
      if (isProcessing) {
        processingGroup.nodes.push(schema);
        return;
      }

      const isOutput = schema.inputs.length > 0 && schema.outputs.length === 0;
      if (isOutput) {
        outputsGroup.nodes.push(schema);
        return;
      }
    });

    return groups;
  }, [nodeSchemas]);

  const onSelect = useCallback(
    (nodeType: string) => {
      props.onSelect(nodeType);
      onClose();
    },
    [props, onClose],
  );

  return (
    <>
      {props.children(onOpen)}
      <Modal scrollBehavior="inside" isOpen={isOpen} onOpenChange={onOpenChange} size="4xl">
        <ModalContent>
          <ModalHeader>{t('title')}</ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            <Accordion defaultExpandedKeys={nodeGroups.map((_, index) => index.toString())}>
              {nodeGroups.map((group, index) => (
                <AccordionItem key={index} title={t('nodeType.' + group.category)}>
                  <div className="flex flex-row flex-wrap gap-4">
                    {group.nodes.map((nodeSchema) => (
                      <div
                        key={nodeSchema.type}
                        onClick={() => onSelect(nodeSchema.type)}
                        className="cursor-pointer hover:bg-primary-50 transition-bg duration-300"
                      >
                        <AttraccessNode tNodeTranslations={props.tNodeTranslations} schema={nodeSchema} previewMode={true} />
                      </div>
                    ))}
                  </div>
                </AccordionItem>
              ))}
            </Accordion>
          </ModalBody>
          <ModalFooter></ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
