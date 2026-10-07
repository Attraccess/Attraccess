import { ResourceFlowNodeSchemaDto, useResourceFlowsServiceResolveNodeSchema } from '@attraccess/react-query-client';
import { useOverlayState } from '@heroui/react';
import { useNodeId, useNodesData } from '@xyflow/react';
import { useFlowContext } from '../../flowContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import { initializeValue, isValueValid } from './property-input/schema-values';
import { configProperty } from './index.config-property';
import { Props } from './index.props';
export function useNodeEditorState(props: Props) {
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
  const { mutateAsync: resolveNodeSchema } = useResourceFlowsServiceResolveNodeSchema<ResourceFlowNodeSchemaDto>();
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

  const onFormSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSave();
    },
    [onSave],
  );

  const resolveSchema = useCallback(
    async (config: Record<string, unknown>) => {
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
    },
    [resourceId, resolveNodeSchema, schema.type],
  );

  const scheduleSchemaResolution = useCallback(
    (config: Record<string, unknown>) => {
      invalidateRequest();
      setIsResolvingSchema(true);
      setSchemaError(undefined);
      schemaResolutionTimeout.current = setTimeout(() => {
        schemaResolutionTimeout.current = undefined;
        void resolveSchema(config);
      }, 300);
    },
    [resolveSchema, invalidateRequest],
  );

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

  const onInputChange = useCallback(
    (propertyName: string, value: unknown, refreshesSchema?: boolean) => {
      const next = { ...dataRef.current, [propertyName]: value };
      dataRef.current = next;
      setData(next);
      if (schema.configSchema.dynamic === true && refreshesSchema) {
        scheduleSchemaResolution(next);
      }
    },
    [schema.configSchema.dynamic, scheduleSchemaResolution],
  );

  const titleKey = 'nodes.' + resolvedSchema.type + '.title';
  const descriptionKey = 'nodes.' + resolvedSchema.type + '.description';
  const nodeTitle = tNodeExists?.(titleKey) ? t(titleKey) : (resolvedSchema.label ?? resolvedSchema.type);
  const nodeDescription = tNodeExists?.(descriptionKey) ? t(descriptionKey) : (resolvedSchema.description ?? '');
  return {
    t,
    tNodeExists,
    schema,
    isOpen,
    open,
    setOpen,
    resourceId,
    formRef,
    data,
    resolvedSchema,
    schemaError,
    isResolvingSchema,
    dataRef,
    onClose,
    onSave,
    onFormSubmit,
    resolveSchema,
    onInputChange,
    nodeTitle,
    nodeDescription,
    props,
  };
}
