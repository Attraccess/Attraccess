import { MeterSelector } from '../../../meters/MeterSelector';
import { Button, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeading, Form } from '@heroui/react';
import { Property, PropertyInput } from './property-input';
import { StandardDrawer } from '../../../../../../components/standardDrawer';
import { isValueValid } from './property-input/schema-values';
import { configProperty } from './index.config-property';
import { Props } from './index.props';
import { useNodeEditorState } from './useNodeEditorState';

export function NodeEditor(props: Props) {
  const {
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
  } = useNodeEditorState(props);

  return (
    <>
      {props.children(open)}
      <StandardDrawer
        dialogProps={{ 'aria-label': nodeTitle }}
        isOpen={isOpen}
        onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : onClose())}
      >
        <DrawerHeader className="flex flex-col gap-1">
          <DrawerHeading className="text-lg font-semibold">{nodeTitle}</DrawerHeading>
          <p className="text-sm text-default-500">{nodeDescription}</p>
        </DrawerHeader>

        <DrawerBody className="flex flex-col gap-2">
          <Form onSubmit={onFormSubmit} ref={formRef} className="flex flex-col gap-4">
            {schemaError ? (
              <p role="alert" className="text-sm text-danger">
                {schemaError}
              </p>
            ) : null}
            {schemaError ? (
              <Button type="button" variant="secondary" onPress={() => void resolveSchema(dataRef.current)}>
                Retry
              </Button>
            ) : null}
            {isResolvingSchema ? <p className="text-sm text-default-500">Refreshing configuration...</p> : null}
            {resolvedSchema.type.includes('.resource.metering.') && (
              <MeterSelector
                resourceId={resourceId}
                value={typeof data.meterId === 'number' ? data.meterId : undefined}
                onChange={(id) => {
                  onInputChange('meterId', id);
                }}
              />
            )}
            {Object.entries((resolvedSchema.configSchema.properties ?? {}) as Record<string, Property<unknown>>)
              .filter(([name]) => !resolvedSchema.type.includes('.resource.metering.') || name !== 'meterId')
              .map(([propertyName, property]) => (
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
              ))}
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
