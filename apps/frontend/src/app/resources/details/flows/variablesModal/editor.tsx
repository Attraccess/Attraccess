import { Button, Input, Label, TextArea, TextField } from '@heroui/react';
import { Select } from '../../../../../components/select';
import { LabeledSwitch } from '../../../../../components/labeledSwitch';
import { ResourceFlowVariableScope } from '@attraccess/react-query-client';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { useCallback, useMemo, useState } from 'react';

export type ValueType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';

export type EditorMode = { mode: 'create' } | { mode: 'edit'; key: string; scope: ResourceFlowVariableScope };

export interface VariableFormValues {
  scope: ResourceFlowVariableScope;
  key: string;
  valueType: ValueType;
  value: unknown;
}

interface Props {
  mode: EditorMode;
  initial?: VariableFormValues;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (values: VariableFormValues) => void;
  t: TFunction;
}

const ALL_TYPES: ValueType[] = ['string', 'number', 'boolean', 'object', 'array', 'null'];

function defaultForType(type: ValueType): unknown {
  if (type === 'string') return '';
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'array') return [];
  if (type === 'object') return {};
  return null;
}

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return '';
  }
}

export function VariableEditor(props: Props) {
  const { mode, initial, isSaving, onCancel, onSubmit, t } = props;
  const isEdit = mode.mode === 'edit';

  const [scope, setScope] = useState<ResourceFlowVariableScope>(
    initial?.scope ?? (isEdit ? mode.scope : ResourceFlowVariableScope.RESOURCE),
  );
  const [key, setKey] = useState(initial?.key ?? '');
  const [valueType, setValueType] = useState<ValueType>(initial?.valueType ?? 'string');
  const [stringValue, setStringValue] = useState<string>(typeof initial?.value === 'string' ? initial.value : '');
  const [numberValue, setNumberValue] = useState<string>(
    typeof initial?.value === 'number' ? String(initial.value) : '',
  );
  const [boolValue, setBoolValue] = useState<boolean>(typeof initial?.value === 'boolean' ? initial.value : false);
  const [jsonValue, setJsonValue] = useState<string>(
    initial && (initial.valueType === 'object' || initial.valueType === 'array') ? stringifyJson(initial.value) : '',
  );
  const [error, setError] = useState<string | null>(null);

  const onChangeType = useCallback((next: ValueType) => {
    setValueType(next);
    setError(null);
    const fallback = defaultForType(next);
    if (next === 'string') setStringValue(typeof fallback === 'string' ? fallback : '');
    if (next === 'number') setNumberValue('0');
    if (next === 'boolean') setBoolValue(false);
    if (next === 'object' || next === 'array') setJsonValue(stringifyJson(fallback));
  }, []);

  const title = useMemo(() => {
    return isEdit ? t('editor.editTitle', { key: mode.mode === 'edit' ? mode.key : '' }) : t('editor.createTitle');
  }, [isEdit, mode, t]);

  const handleSubmit = useCallback(() => {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      setError(t('editor.errors.keyRequired'));
      return;
    }

    let parsed: unknown;
    if (valueType === 'string') {
      parsed = stringValue;
    } else if (valueType === 'number') {
      const n = Number(numberValue);
      if (numberValue.trim() === '' || Number.isNaN(n) || !Number.isFinite(n)) {
        setError(t('editor.errors.numberInvalid'));
        return;
      }
      parsed = n;
    } else if (valueType === 'boolean') {
      parsed = boolValue;
    } else if (valueType === 'null') {
      parsed = null;
    } else {
      try {
        parsed = JSON.parse(jsonValue);
      } catch {
        setError(t('editor.errors.jsonInvalid'));
        return;
      }
      if (valueType === 'object' && (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))) {
        setError(t('editor.errors.typeMismatchObject'));
        return;
      }
      if (valueType === 'array' && !Array.isArray(parsed)) {
        setError(t('editor.errors.typeMismatchArray'));
        return;
      }
    }

    setError(null);
    onSubmit({ scope, key: trimmedKey, valueType, value: parsed });
  }, [key, valueType, stringValue, numberValue, boolValue, jsonValue, scope, onSubmit, t]);

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{title}</h3>

      <Select
        label={t('editor.scope')}
        value={scope}
        onChange={(v) => setScope(v as ResourceFlowVariableScope)}
        isDisabled={isEdit}
        items={[
          { key: ResourceFlowVariableScope.RESOURCE, label: t('editor.scopeResource') },
          { key: ResourceFlowVariableScope.GLOBAL, label: t('editor.scopeGlobal') },
        ]}
      />

      <TextField value={key} onChange={setKey} isDisabled={isEdit}>
        <Label>{t('editor.key')}</Label>
        <Input placeholder={t('editor.keyPlaceholder')} />
      </TextField>

      <Select
        label={t('editor.type')}
        value={valueType}
        onChange={(v) => onChangeType(v as ValueType)}
        items={ALL_TYPES.map((typeOption) => ({
          key: typeOption,
          label: t(`editor.types.${typeOption}`),
        }))}
      />

      {valueType === 'string' && (
        <TextField value={stringValue} onChange={setStringValue}>
          <Label>{t('editor.value')}</Label>
          <Input placeholder={t('editor.valuePlaceholderString')} />
        </TextField>
      )}
      {valueType === 'number' && (
        <TextField value={numberValue} onChange={setNumberValue}>
          <Label>{t('editor.value')}</Label>
          <Input type="number" placeholder={t('editor.valuePlaceholderNumber')} />
        </TextField>
      )}
      {valueType === 'boolean' && (
        <div className="flex items-center gap-3">
          <span className="text-sm">{t('editor.value')}</span>
          <LabeledSwitch isSelected={boolValue} onChange={setBoolValue} />
        </div>
      )}
      {(valueType === 'object' || valueType === 'array') && (
        <TextField value={jsonValue} onChange={setJsonValue}>
          <Label>{t('editor.value')}</Label>
          <TextArea rows={6} placeholder={t('editor.valuePlaceholderJson')} className="font-mono text-sm" />
        </TextField>
      )}

      {error && <p className="text-danger text-sm">{error}</p>}

      <div className="flex flex-row justify-end gap-2">
        <Button variant="ghost" onPress={onCancel} isDisabled={isSaving}>
          {t('actions.cancel')}
        </Button>
        <Button variant="primary" onPress={handleSubmit} isPending={isSaving}>
          {t('actions.save')}
        </Button>
      </div>
    </div>
  );
}
