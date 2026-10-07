import { fireEvent } from '@testing-library/react';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import type { DynamicNodeEditorTestScope } from './index.test';
import { act } from '@testing-library/react';

export function registerAllowsAnOptionalDefaultedNumericFieldToBeClearedBeforeSaving(
  scope: DynamicNodeEditorTestScope,
): void {
  it('allows an optional defaulted numeric field to be cleared before saving', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(
      scope.editor({
        ...scope.base,
        configSchema: {
          ...scope.base.configSchema,
          dynamic: false,
          properties: { ...scope.baseProperties, timeout: { type: 'number', title: 'Optional timeout', default: 15 } },
        },
      }),
    );
    fireEvent.click(screen.getByText('Open'));
    const timeout = screen.getByRole('textbox', { name: /Optional timeout/ });
    await user.clear(timeout);
    await user.tab();
    await user.click(screen.getByText('editor.buttons.save'));
    expect(scope.mocks.update).toHaveBeenCalledTimes(1);
    expect(scope.mocks.update.mock.calls[0][1].timeout).toBeUndefined();
  });
}

export function registerBlocksIncompatibleEnumValuesEvenThroughFormSubmit(scope: DynamicNodeEditorTestScope): void {
  it('blocks incompatible enum values even through form submit', async () => {
    scope.mocks.current = { data: { command: 'first', choice: 'removed' } };
    const schema = {
      ...scope.base,
      configSchema: {
        ...scope.base.configSchema,
        dynamic: false,
        properties: {
          ...scope.baseProperties,
          choice: { type: 'string', title: 'Choice', enum: ['available'] },
        },
      },
    };
    render(scope.editor(schema));
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByText('Select an available option.')).toBeInTheDocument();
    scope.submit();
    expect(scope.mocks.update).not.toHaveBeenCalled();
  });
}

export function registerBlocksSaveWhenAResolvedSchemaRequiresAFieldAbsentFromItsProperties(
  scope: DynamicNodeEditorTestScope,
): void {
  it('blocks save when a resolved schema requires a field absent from its properties', async () => {
    render(scope.editor());
    fireEvent.click(screen.getByText('Open'));
    await scope.respond(0, {
      ...scope.base,
      configSchema: { ...scope.base.configSchema, required: ['missingChannel'] },
    });
    expect(screen.getByText('editor.buttons.save')).toBeDisabled();
    scope.submit();
    expect(scope.mocks.update).not.toHaveBeenCalled();
  });
}

export function registerBlocksSubmitDuringInitialResolutionDebounceAndFailureThenRetriesCurrentValues(
  scope: DynamicNodeEditorTestScope,
): void {
  it('blocks submit during initial resolution, debounce, and failure, then retries current values', async () => {
    render(scope.editor());
    fireEvent.click(screen.getByText('Open'));
    scope.submit();
    expect(scope.mocks.update).not.toHaveBeenCalled();
    await scope.respond(0);
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'second' } });
    scope.submit();
    expect(screen.getByText('editor.buttons.save')).toBeDisabled();
    expect(scope.mocks.update).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(300));
    await scope.respond(1, scope.base, false);
    scope.submit();
    expect(scope.mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Retry'));
    expect(scope.mocks.resolveNodeSchema.mock.calls[2][0].requestBody).toEqual({ config: { command: 'second' } });
    await scope.respond(2);
    scope.submit();
    expect(scope.mocks.update).toHaveBeenCalledWith('node', { command: 'second' });
  });
}

export function registerGuardsKeyboardEnterWhilePendingAndSavesAfterResolution(
  scope: DynamicNodeEditorTestScope,
): void {
  it('guards keyboard Enter while pending and saves after resolution', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(scope.editor());
    fireEvent.click(screen.getByText('Open'));
    await user.click(screen.getByLabelText('Command'));
    await user.keyboard('{Enter}');
    expect(scope.mocks.update).not.toHaveBeenCalled();
    await scope.respond(0);
    await user.keyboard('{Enter}');
    expect(scope.mocks.update).toHaveBeenCalledWith('node', { command: 'first' });
  });
}

export function registerIgnoresOldSelectionResultsDuringTheNextDebounceAndCancelsTimersOnClose(
  scope: DynamicNodeEditorTestScope,
): void {
  it('ignores old selection results during the next debounce and cancels timers on close', async () => {
    render(scope.editor());
    fireEvent.click(screen.getByText('Open'));
    await scope.respond(0);
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'second' } });
    await act(async () => vi.advanceTimersByTime(300));
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'third' } });
    await scope.respond(1, {
      ...scope.base,
      configSchema: { properties: { stale: { type: 'string', title: 'Stale' } } },
    });
    expect(screen.queryByLabelText('Stale')).not.toBeInTheDocument();
    scope.submit();
    expect(scope.mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('editor.buttons.cancel'));
    await act(async () => vi.advanceTimersByTime(300));
    expect(scope.mocks.resolveNodeSchema).toHaveBeenCalledTimes(2);
  });
}

export function registerIgnoresResponsesAfterCloseReopenWhenAnOlderResolutionCompletes(
  scope: DynamicNodeEditorTestScope,
): void {
  it('ignores responses after close/reopen when an older resolution completes', async () => {
    render(scope.editor());
    fireEvent.click(screen.getByText('Open'));
    fireEvent.click(screen.getByText('editor.buttons.cancel'));
    fireEvent.click(screen.getByText('Open'));
    await scope.respond(0, {
      ...scope.base,
      configSchema: { properties: { stale: { type: 'string', title: 'Stale' } } },
    });
    expect(screen.queryByLabelText('Stale')).not.toBeInTheDocument();
    scope.submit();
    expect(scope.mocks.update).not.toHaveBeenCalled();
    await scope.respond(1);
    scope.submit();
    expect(scope.mocks.update).toHaveBeenCalledWith('node', { command: 'first' });
  });
}

export function registerInvalidatesAnInFlightRequestWhenTheSchemaChanges(scope: DynamicNodeEditorTestScope): void {
  it('invalidates an in-flight request when the schema changes', async () => {
    const view = render(scope.editor());
    fireEvent.click(screen.getByText('Open'));
    const next = { ...scope.base, type: 'next' };
    view.rerender(scope.editor(next));
    await scope.respond(0, {
      ...scope.base,
      configSchema: { properties: { stale: { type: 'string', title: 'Stale' } } },
    });
    expect(screen.queryByLabelText('Stale')).not.toBeInTheDocument();
    await scope.respond(1, next);
    scope.submit();
    expect(scope.mocks.update).toHaveBeenCalledTimes(1);
  });
}

export function registerPersistsNestedDefaultsAndRequiredFalseValuesWithoutEditing(
  scope: DynamicNodeEditorTestScope,
): void {
  it('persists nested defaults and required false values without editing', async () => {
    const schema = {
      ...scope.base,
      configSchema: {
        dynamic: false,
        required: ['enabled', 'nested'],
        properties: {
          command: { type: 'string', title: 'Command', default: 'first' },
          enabled: { type: 'boolean' },
          nested: {
            type: 'object',
            properties: {
              count: { type: 'integer', default: 0 },
              deeper: { type: 'object', properties: { text: { type: 'string', default: 'nested' } } },
            },
          },
          fixed: {
            type: 'string',
            title: 'Fixed',
            default: 'locked',
            readOnly: true,
            description: 'Conflict details\nKeep this value.',
          },
        },
      },
    };
    render(scope.editor(schema));
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByLabelText('Fixed')).toHaveAttribute('readonly');
    scope.submit();
    expect(scope.mocks.update).toHaveBeenCalledWith('node', {
      command: 'first',
      enabled: false,
      nested: { count: 0, deeper: { text: 'nested' } },
      fixed: 'locked',
    });
    expect(scope.mocks.resolveNodeSchema).not.toHaveBeenCalled();
  });
}

export function registerSendsSavedDynamicFieldsBeforeTheFullSchemaIsAvailable(scope: DynamicNodeEditorTestScope): void {
  it('sends saved dynamic fields before the full schema is available', async () => {
    scope.mocks.current = { data: { command: 'first', nested: { saved: 'keep' }, removed: 'old' } };
    render(scope.editor());
    fireEvent.click(screen.getByText('Open'));
    expect(scope.mocks.resolveNodeSchema.mock.calls[0][0].requestBody.config.nested).toEqual({ saved: 'keep' });
    await scope.respond(0, {
      ...scope.base,
      configSchema: {
        properties: {
          ...scope.baseProperties,
          nested: { type: 'object', properties: { saved: { type: 'string' } } },
        },
      },
    });
    scope.submit();
    expect(scope.mocks.update).toHaveBeenCalledWith('node', { command: 'first', nested: { saved: 'keep' } });
  });
}
