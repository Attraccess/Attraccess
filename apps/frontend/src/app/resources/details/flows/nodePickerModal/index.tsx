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
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ResourceFlowNodeSchemaDto, useResourceFlowsServiceGetNodeSchemas } from '@attraccess/react-query-client';
import de from './de.json';
import en from './en.json';
import { AttraccessNode } from '../node';
import { TFunction } from 'i18next';

interface Props {
  onSelect: (nodeType: string) => void;
  children: (open: () => void) => React.ReactNode;
  resourceId: number;
  tNodeTranslations: TFunction;
}

interface NodeGroup {
  nodes: ResourceFlowNodeSchemaDto[];
  category: 'input' | 'output' | 'processing';
}

export function NodePickerModal(props: Props) {
  const { isOpen, onOpenChange, onClose, onOpen } = useDisclosure();

  const { t } = useTranslations('nodePicker', {
    de,
    en,
  });

  const { data: nodeSchemas } = useResourceFlowsServiceGetNodeSchemas({ resourceId: props.resourceId });

  const nodeGroups = useMemo((): NodeGroup[] => {
    const inputsGroup: NodeGroup = { category: 'input', nodes: [] };
    const processingGroup: NodeGroup = { category: 'processing', nodes: [] };
    const outputsGroup: NodeGroup = { category: 'output', nodes: [] };

    const groups = [inputsGroup, processingGroup, outputsGroup];

    if (!nodeSchemas) {
      return groups;
    }

    // Group nodes by type
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

      const isOutput = schema.inputs.length === 0 && schema.outputs.length > 0;
      if (isOutput) {
        outputsGroup.nodes.push(schema);
        return;
      }

      throw new Error('Invalid node schema: no inputs or outputs: ' + JSON.stringify(schema));
    });

    return groups;
  }, [nodeSchemas]);

  const onSelect = useCallback(
    (nodeType: string) => {
      props.onSelect(nodeType);
      onClose();
    },
    [props, onClose]
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
                        <AttraccessNode
                          tNodeTranslations={props.tNodeTranslations}
                          schema={nodeSchema}
                          previewMode={true}
                        />
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
