import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, vi } from 'vitest';
import type { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import { NodeEditor } from './index';
import { registerSelectsControllerChannelAndOperationThroughHeroUiAndReplacesAnIncompatiblePulseBeforeS } from './index.selects-controller-channel-and-operation-through-hero-ui-and-replaces-an-incompatible-pulse-before-s.test-cases';
import { registerBlocksSaveWhenAResolvedSchemaRequiresAFieldAbsentFromItsProperties } from './index.test-cases';
import { registerAllowsAnOptionalDefaultedNumericFieldToBeClearedBeforeSaving } from './index.test-cases';
import { registerGuardsKeyboardEnterWhilePendingAndSavesAfterResolution } from './index.test-cases';
import { registerSendsSavedDynamicFieldsBeforeTheFullSchemaIsAvailable } from './index.test-cases';
import { registerBlocksSubmitDuringInitialResolutionDebounceAndFailureThenRetriesCurrentValues } from './index.test-cases';
import { registerIgnoresResponsesAfterCloseReopenWhenAnOlderResolutionCompletes } from './index.test-cases';
import { registerIgnoresOldSelectionResultsDuringTheNextDebounceAndCancelsTimersOnClose } from './index.test-cases';
import { registerInvalidatesAnInFlightRequestWhenTheSchemaChanges } from './index.test-cases';
import { registerPersistsNestedDefaultsAndRequiredFalseValuesWithoutEditing } from './index.test-cases';
import { registerBlocksIncompatibleEnumValuesEvenThroughFormSubmit } from './index.test-cases';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  current: { data: {} as Record<string, unknown> },
  resolveNodeSchema: vi.fn(),
}));
vi.mock('@xyflow/react', () => ({ useNodeId: () => 'node', useNodesData: () => mocks.current }));
vi.mock('../../flowContext', () => ({ useFlowContext: () => ({ updateNodeData: mocks.update, resourceId: 1 }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useBillingServiceGetBillingConfiguration: () => ({ data: { minorUnit: 2 } }),
  useResourceFlowsServiceResolveNodeSchema: () => ({
    mutateAsync: mocks.resolveNodeSchema,
  }),
}));
vi.mock('../../../../../../../components/mqttServerSelect', () => ({ MqttServerSelect: () => null }));
vi.mock('../../../../../../../components/companionDeviceSelect', () => ({ CompanionDeviceSelect: () => null }));
vi.mock('../../../../../../mqtt/servers/CreateMqttServerPage', () => ({ CreateMqttServerForm: () => null }));
vi.mock('../../../../../../components/standardDrawer', () => ({
  StandardDrawer: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

const baseProperties = {
  command: { type: 'string', title: 'Command', refreshesSchema: true, default: 'first' },
};

const base: ResourceFlowNodeSchemaDto = {
  type: 'test',
  configSchema: {
    dynamic: true,
    properties: baseProperties,
  },
} as unknown as ResourceFlowNodeSchemaDto;

function editor(schema = base) {
  return (
    <NodeEditor schema={schema} tNodeTranslations={(key) => key}>
      {(open) => <button onClick={open}>Open</button>}
    </NodeEditor>
  );
}

const pending: Array<{
  resolve: (schema: ResourceFlowNodeSchemaDto) => void;
  reject: (error: Error) => void;
}> = [];
async function respond(index: number, schema = base, ok = true) {
  await act(async () => (ok ? pending[index].resolve(schema) : pending[index].reject(new Error('failed'))));
}
function submit() {
  const form = screen.getByLabelText('Command').closest('form');
  if (!form) throw new Error('Missing editor form');
  fireEvent.submit(form);
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.update.mockClear();
  mocks.current = { data: {} };
  pending.length = 0;
  mocks.resolveNodeSchema.mockImplementation(
    () => new Promise<ResourceFlowNodeSchemaDto>((resolve, reject) => pending.push({ resolve, reject })),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mocks.resolveNodeSchema.mockReset();
});

describe('dynamic node editor', () => {
  defineDynamicNodeEditorTests();
});

export function defineDynamicNodeEditorTests() {
  const scope = {
    get mocks() {
      return mocks;
    },
    get base() {
      return base;
    },
    get baseProperties() {
      return baseProperties;
    },
    submit,
    editor,
    respond,
  };
  registerSelectsControllerChannelAndOperationThroughHeroUiAndReplacesAnIncompatiblePulseBeforeS(scope);

  registerBlocksSaveWhenAResolvedSchemaRequiresAFieldAbsentFromItsProperties(scope);

  registerAllowsAnOptionalDefaultedNumericFieldToBeClearedBeforeSaving(scope);

  registerGuardsKeyboardEnterWhilePendingAndSavesAfterResolution(scope);

  registerSendsSavedDynamicFieldsBeforeTheFullSchemaIsAvailable(scope);

  registerBlocksSubmitDuringInitialResolutionDebounceAndFailureThenRetriesCurrentValues(scope);

  registerIgnoresResponsesAfterCloseReopenWhenAnOlderResolutionCompletes(scope);

  registerIgnoresOldSelectionResultsDuringTheNextDebounceAndCancelsTimersOnClose(scope);

  registerInvalidatesAnInFlightRequestWhenTheSchemaChanges(scope);

  registerPersistsNestedDefaultsAndRequiredFalseValuesWithoutEditing(scope);

  registerBlocksIncompatibleEnumValuesEvenThroughFormSubmit(scope);

  return scope;
}

export type DynamicNodeEditorTestScope = ReturnType<typeof defineDynamicNodeEditorTests>;
