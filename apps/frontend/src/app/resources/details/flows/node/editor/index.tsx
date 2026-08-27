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
import { TExists, TFunction } from '@attraccess/plugins-frontend-ui';
import { StandardDrawer } from '../../../../../../components/standardDrawer';
import { getBaseUrl } from '../../../../../../api';

interface Props {
  schema: ResourceFlowNodeSchemaDto;
  children: (onOpen: () => void) => React.ReactNode;
  tNodeTranslations: TFunction;
  tNodeExists?: TExists;
}

export function NodeEditor(props: Props) {
  const { tNodeTranslations: t, tNodeExists, schema } = props;
  const { isOpen, open, setOpen, close } = useOverlayState();

  const nodeId = useNodeId();
  const currentData = useNodesData(nodeId as string);
  const { updateNodeData, resourceId } = useFlowContext();
  const formRef = useRef<HTMLFormElement>(null);

  const [data, setData] = useState<Record<string, unknown>>(currentData?.data ?? {});
  const [resolvedSchema, setResolvedSchema] = useState(schema);
  const [schemaError, setSchemaError] = useState<string>();
  const [isResolvingSchema, setIsResolvingSchema] = useState(false);
  const schemaRequest = useRef(0);
  const schemaAbortController = useRef<AbortController | undefined>(undefined);
  const schemaResolutionTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dataRef = useRef(data);

  useEffect(() => {
    setData(currentData?.data ?? {});
  }, [currentData]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    setResolvedSchema(schema);
    setSchemaError(undefined);
  }, [schema]);

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

  const onFormSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onSave();
  }, [onSave]);

  const resolveSchema = useCallback(async (config: Record<string, unknown>) => {
    schemaAbortController.current?.abort();
    const abortController = new AbortController();
    schemaAbortController.current = abortController;
    const request = ++schemaRequest.current;
    setIsResolvingSchema(true);
    setSchemaError(undefined);

    try {
      const response = await fetch(
        `${getBaseUrl()}/api/resources/${resourceId}/flow/node-schemas/${encodeURIComponent(schema.type)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ config }),
          credentials: 'include',
          signal: abortController.signal,
        },
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const nextSchema = (await response.json()) as ResourceFlowNodeSchemaDto;
      if (request !== schemaRequest.current) return;

      setResolvedSchema(nextSchema);
      const properties = nextSchema.configSchema.properties as Record<string, unknown> | undefined;
      const nextData = Object.fromEntries(
        Object.entries(dataRef.current).filter(([name]) => properties?.[name] !== undefined),
      );
      dataRef.current = nextData;
      setData(nextData);
    } catch (error) {
      if (request === schemaRequest.current && !(error instanceof Error && error.name === 'AbortError')) {
        setSchemaError('Unable to refresh this plugin configuration. Please try again.');
      }
    } finally {
      if (request === schemaRequest.current) setIsResolvingSchema(false);
    }
  }, [resourceId, schema.type]);

  const scheduleSchemaResolution = useCallback((config: Record<string, unknown>) => {
    schemaAbortController.current?.abort();
    schemaRequest.current += 1;
    if (schemaResolutionTimeout.current) {
      clearTimeout(schemaResolutionTimeout.current);
    }
    schemaResolutionTimeout.current = setTimeout(() => {
      schemaResolutionTimeout.current = undefined;
      void resolveSchema(config);
    }, 300);
  }, [resolveSchema]);

  useEffect(() => () => {
    if (schemaResolutionTimeout.current) {
      clearTimeout(schemaResolutionTimeout.current);
    }
    schemaAbortController.current?.abort();
  }, []);

  useEffect(() => {
    if (isOpen && schema.configSchema.dynamic === true) {
      void resolveSchema(dataRef.current);
    }
  }, [isOpen, resolveSchema, schema]);

  const onInputChange = useCallback((propertyName: string, value: unknown, refreshesSchema?: boolean) => {
    const next = { ...dataRef.current, [propertyName]: value };
    dataRef.current = next;
    setData(next);
    if (resolvedSchema.configSchema.dynamic === true && refreshesSchema) {
      scheduleSchemaResolution(next);
    }
  }, [resolvedSchema.configSchema.dynamic, scheduleSchemaResolution]);

  const titleKey = 'nodes.' + resolvedSchema.type + '.title';
  const descriptionKey = 'nodes.' + resolvedSchema.type + '.description';
  const nodeTitle = tNodeExists?.(titleKey) ? t(titleKey) : (resolvedSchema.label ?? resolvedSchema.type);
  const nodeDescription = tNodeExists?.(descriptionKey)
    ? t(descriptionKey)
    : (resolvedSchema.description ?? '');

  return (
    <>
      {props.children(open)}
      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen}>
        <DrawerHeader className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{nodeTitle}</h2>
          <p className="text-sm text-default-500">{nodeDescription}</p>
        </DrawerHeader>

        <DrawerBody className="flex flex-col gap-2">
          <Form onSubmit={onFormSubmit} ref={formRef} className="flex flex-col gap-4">
            {schemaError ? <p role="alert" className="text-sm text-danger">{schemaError}</p> : null}
            {isResolvingSchema ? <p className="text-sm text-default-500">Refreshing configuration...</p> : null}
            {Object.entries((resolvedSchema.configSchema.properties ?? {}) as Record<string, Property<unknown>>).map(
              ([propertyName, property]) => (
                <PropertyInput
                  key={propertyName}
                  isRequired={(resolvedSchema.configSchema.required as string[])?.includes(propertyName)}
                  nodeType={resolvedSchema.type}
                  tNodeTranslations={t}
                  tNodeExists={tNodeExists}
                  name={propertyName}
                  schema={property}
                  value={data[propertyName]}
                  onChange={(value, refreshesSchema) => onInputChange(propertyName, value, refreshesSchema)}
                />
              ),
            )}
            <input hidden type="submit" />
          </Form>
        </DrawerBody>

        <DrawerFooter className="flex flex-wrap gap-2 justify-end">
          <Button variant="ghost" onPress={close}>
            {t('editor.buttons.cancel')}
          </Button>
          <Button variant="primary" onPress={onSave}>
            {t('editor.buttons.save')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>
    </>
  );
}
