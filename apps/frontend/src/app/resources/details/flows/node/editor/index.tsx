import { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import {
  Button,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Form,
  useOverlayState,
} from '@heroui/react';
import { useNodeId, useNodesData } from '@xyflow/react';
import { useFlowContext } from '../../flowContext';
import { Property, PropertyInput } from './property-input';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { StandardDrawer } from '../../../../../../components/standardDrawer';

interface Props {
  schema: ResourceFlowNodeSchemaDto;
  children: (onOpen: () => void) => React.ReactNode;
  tNodeTranslations: TFunction;
}

export function NodeEditor(props: Props) {
  const { tNodeTranslations: t, schema } = props;
  const { isOpen, open, setOpen, close } = useOverlayState();

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
    close();
  }, [nodeId, data, updateNodeData, close]);

  const onInputChange = useCallback((propertyName: string, value: unknown) => {
    setData((prev) => ({ ...prev, [propertyName]: value }));
  }, []);

  return (
    <>
      {props.children(open)}
      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen}>
        <DrawerHeader>
          <h2 className="text-lg font-semibold">{t('nodes.' + schema.type + '.title')}</h2>
          <p className="text-sm text-muted">{t('nodes.' + schema.type + '.description')}</p>
        </DrawerHeader>

        <DrawerBody className="flex flex-col gap-2">
          <Form onSubmit={onSave} ref={formRef} className="flex flex-col gap-4">
            {Object.entries(schema.configSchema.properties as Record<string, Property<unknown>>).map(
              ([propertyName, property]) => (
                <PropertyInput
                  key={propertyName}
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
        </DrawerBody>

        <DrawerFooter>
          <Button variant="primary" onPress={onSave}>
            {t('editor.buttons.save')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>
    </>
  );
}
