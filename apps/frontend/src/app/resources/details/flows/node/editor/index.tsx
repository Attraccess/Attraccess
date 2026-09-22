import { ResourceFlowNodeSchemaDto, useResourceFlowsServiceResolveNodeSchema } from '@attraccess/react-query-client';
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
import { initializeValue, isValueValid } from './property-input/schema-values';

const configProperty = (schema: ResourceFlowNodeSchemaDto) =>
  ({ ...schema.configSchema, type: 'object' }) as Property<unknown>;

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
  const { mutateAsync: resolveNodeSchema } =
    useResourceFlowsServiceResolveNodeSchema<ResourceFlowNodeSchemaDto>();
  const schemaRequest = useRef(0);
  const schemaResolutionTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dataRef = useRef(data);

  const canSave = useRef(false);
  const invalidateRequest = useCallback(() => {
    canSave.current = false;
    schemaRequest.current += 1;
    clearTimeout(schemaResolutionTimeout.current);
    schemaResolutionTimeout.current = undefined;
  }, []);
  const onClose = useCallback(() => {
    invalidateRequest();
    close();
  }, [close, invalidateRequest]);

  const onSave = useCallback(() => {
    if (!canSave.current || !isValueValid(configProperty(resolvedSchema), dataRef.current, true) || !formRef.current) {
      return;
    }
    if (!formRef.current.checkValidity()) {
      return;
    }
    updateNodeData(nodeId as string, dataRef.current);
    onClose();
  }, [nodeId, resolvedSchema, updateNodeData, onClose]);

  const onFormSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onSave();
  }, [onSave]);

  const resolveSchema = useCallback(async (config: Record<string, unknown>) => {
    canSave.current = false;
    const request = ++schemaRequest.current;
    setIsResolvingSchema(true);
    setSchemaError(undefined);

    try {
      const nextSchema = await resolveNodeSchema({
        nodeType: schema.type,
        requestBody: { config },
        resourceId,
      });
      if (request !== schemaRequest.current) return;

      setResolvedSchema(nextSchema);
      const properties = configProperty(nextSchema).properties ?? {};
      const retainedData = Object.fromEntries(
        Object.entries(dataRef.current).filter(([name]) => Object.hasOwn(properties, name)),
      );
      const nextData = initializeValue(configProperty(nextSchema), retainedData, true) as Record<string, unknown>;
      dataRef.current = nextData;
      setData(nextData);
      canSave.current = true;
    } catch {
      if (request === schemaRequest.current) {
        setSchemaError('Unable to refresh this plugin configuration. Please try again.');
      }
    } finally {
      if (request === schemaRequest.current) setIsResolvingSchema(false);
    }
  }, [resourceId, resolveNodeSchema, schema.type]);

  const scheduleSchemaResolution = useCallback((config: Record<string, unknown>) => {
    invalidateRequest();
    setIsResolvingSchema(true);
    setSchemaError(undefined);
    schemaResolutionTimeout.current = setTimeout(() => {
      schemaResolutionTimeout.current = undefined;
      void resolveSchema(config);
    }, 300);
  }, [resolveSchema, invalidateRequest]);

  useEffect(() => {
    invalidateRequest();
    if (isOpen) {
      const initial = initializeValue(configProperty(schema), currentData?.data ?? {}, true) as Record<string, unknown>;
      dataRef.current = initial;
      setData(initial);
      setResolvedSchema(schema);
      setSchemaError(undefined);
      setIsResolvingSchema(schema.configSchema.dynamic === true);
      if (schema.configSchema.dynamic === true) void resolveSchema(initial);
      else canSave.current = true;
    }
    return invalidateRequest;
  }, [isOpen, resolveSchema, schema, currentData, invalidateRequest]);

  const onInputChange = useCallback((propertyName: string, value: unknown, refreshesSchema?: boolean) => {
    const next = { ...dataRef.current, [propertyName]: value };
    dataRef.current = next;
    setData(next);
    if (schema.configSchema.dynamic === true && refreshesSchema) {
      scheduleSchemaResolution(next);
    }
  }, [schema.configSchema.dynamic, scheduleSchemaResolution]);

  const titleKey = 'nodes.' + resolvedSchema.type + '.title';
  const descriptionKey = 'nodes.' + resolvedSchema.type + '.description';
  const nodeTitle = tNodeExists?.(titleKey) ? t(titleKey) : (resolvedSchema.label ?? resolvedSchema.type);
  const nodeDescription = tNodeExists?.(descriptionKey)
    ? t(descriptionKey)
    : (resolvedSchema.description ?? '');

  return (
    <>
      {props.children(open)}
      <StandardDrawer isOpen={isOpen} onOpenChange={(nextOpen) => nextOpen ? setOpen(true) : onClose()}>
        <DrawerHeader className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{nodeTitle}</h2>
          <p className="text-sm text-default-500">{nodeDescription}</p>
        </DrawerHeader>

        <DrawerBody className="flex flex-col gap-2">
          <Form onSubmit={onFormSubmit} ref={formRef} className="flex flex-col gap-4">
            {schemaError ? <p role="alert" className="text-sm text-danger">{schemaError}</p> : null}
            {schemaError ? (
              <Button type="button" variant="secondary" onPress={() => void resolveSchema(dataRef.current)}>
                Retry
              </Button>
            ) : null}
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
          <Button variant="ghost" onPress={onClose}>
            {t('editor.buttons.cancel')}
          </Button>
          <Button
            variant="primary"
            onPress={onSave}
            isDisabled={isResolvingSchema || !!schemaError || !isValueValid(configProperty(resolvedSchema), data, true)}
          >
            {t('editor.buttons.save')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>
    </>
  );
}
