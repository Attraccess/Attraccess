import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import type { DynamicNodeEditorTestScope } from './index.test';
export function registerSelectsControllerChannelAndOperationThroughHeroUiAndReplacesAnIncompatiblePulseBeforeS(
  scope: DynamicNodeEditorTestScope,
): void {
  it('selects controller, channel, and operation through HeroUI and replaces an incompatible pulse before saving', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    scope.mocks.current = { data: { revision: 'outdated' } };
    const commandSchema = (
      channels: boolean,
      operations: string[] = [],
      argument?: 'duration' | 'value',
      revision = 'current-revision',
    ): ResourceFlowNodeSchemaDto => ({
      ...scope.base,
      configSchema: {
        dynamic: true,
        required: ['controllerId', 'channel', 'operation', 'revision', ...(argument ? [argument] : [])],
        properties: {
          ...scope.baseProperties,
          controllerId: {
            type: 'integer',
            title: 'Controller',
            oneOf: [
              { const: 1, title: 'Controller A' },
              { const: 2, title: 'Controller B' },
            ],
            refreshesSchema: true,
          },
          revision: { type: 'string', title: 'Revision', readOnly: true, default: revision },
          ...(channels
            ? {
                channel: {
                  type: 'string',
                  title: 'Channel',
                  oneOf: [
                    { const: 'pulse-output', title: 'Pulse-capable output' },
                    { const: 'set-output', title: 'Set-only output' },
                  ],
                  refreshesSchema: true,
                },
              }
            : {}),
          ...(operations.length
            ? {
                operation: {
                  type: 'string',
                  title: 'Operation',
                  oneOf: operations.map((operation) => ({
                    const: operation,
                    title: operation === 'pulse' ? 'Pulse' : 'Set',
                  })),
                  refreshesSchema: true,
                },
              }
            : {}),
          ...(argument === 'duration' ? { duration: { type: 'number', title: 'Duration', default: 250 } } : {}),
          ...(argument === 'value' ? { value: { type: 'boolean', title: 'Value' } } : {}),
        },
      },
    });
    async function select(label: string, option: string, requestCount: number) {
      await user.click(screen.getByRole('button', { name: new RegExp(label) }));
      await user.click(await screen.findByRole('option', { name: option }));
      expect(screen.getByText('editor.buttons.save')).toBeDisabled();
      scope.submit();
      expect(scope.mocks.update).not.toHaveBeenCalled();
      await waitFor(() => expect(scope.mocks.resolveNodeSchema).toHaveBeenCalledTimes(requestCount));
      return scope.mocks.resolveNodeSchema.mock.calls[requestCount - 1][0].requestBody.config;
    }

    render(scope.editor(commandSchema(false)));
    await user.click(screen.getByText('Open'));
    await scope.respond(0, commandSchema(false));
    expect(await select('Controller', 'Controller B', 2)).toMatchObject({ controllerId: 2 });
    await scope.respond(1, commandSchema(true));
    expect(await select('Channel', 'Pulse-capable output', 3)).toMatchObject({
      controllerId: 2,
      channel: 'pulse-output',
    });
    await scope.respond(2, commandSchema(true, ['set', 'pulse']));
    expect(await select('Operation', 'Pulse', 4)).toMatchObject({ operation: 'pulse' });
    await scope.respond(3, commandSchema(true, ['set', 'pulse'], 'duration'));
    expect(screen.getByText('editor.buttons.save')).toBeEnabled();

    expect(await select('Channel', 'Set-only output', 5)).toMatchObject({ channel: 'set-output', operation: 'pulse' });
    await scope.respond(4, commandSchema(true, ['set'], undefined, 'new-revision'));
    expect(screen.getByText('Select an available option.')).toBeInTheDocument();
    expect(screen.getByText('editor.buttons.save')).toBeDisabled();
    scope.submit();
    expect(scope.mocks.update).not.toHaveBeenCalled();
    expect(await select('Operation', 'Set', 6)).toMatchObject({ channel: 'set-output', operation: 'set' });
    await scope.respond(5, commandSchema(true, ['set'], 'value', 'new-revision'));

    expect(screen.getByRole('switch', { name: 'Value' })).not.toBeChecked();
    expect(screen.getByLabelText('Revision')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Revision')).toHaveValue('new-revision');
    expect(screen.queryByText('Select an available option.')).not.toBeInTheDocument();
    await user.click(screen.getByText('editor.buttons.save'));
    expect(scope.mocks.update).toHaveBeenCalledExactlyOnceWith('node', {
      command: 'first',
      controllerId: 2,
      channel: 'set-output',
      operation: 'set',
      value: false,
      revision: 'new-revision',
    });
  });
}
