import { act } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import type { RootTestRegistrationsTestScope } from './index.test';
import type { Node } from '@xyflow/react';
import type { Edge } from '@xyflow/react';

export function registerAddsCatalogAndDroppedNodesSwitchesCanvasModeAndLaysOutTheGraph(
  scope: RootTestRegistrationsTestScope,
): void {
  it('adds catalog and dropped nodes, switches canvas mode and lays out the graph', () => {
    scope.show();
    fireEvent.click(screen.getByText('Insert trigger'));
    expect(scope.state.add).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'trigger', position: { x: 400, y: 0 } }),
    );
    act(() =>
      scope.state.flowProps.onDrop({
        preventDefault: vi.fn(),
        dataTransfer: { getData: () => 'action' },
        clientX: 50,
        clientY: 100,
      }),
    );
    expect(scope.state.add).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'action', position: { x: 40, y: 80 }, data: { __centerOnDrop: true } }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'actions.modePan' }));
    expect(scope.state.flowProps.panOnDrag).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'actions.modeSelect' }));
    expect(scope.state.flowProps.selectionOnDrag).toBe(true);
    fireEvent.click(document.querySelector('svg.lucide-layout-grid')?.closest('button') as HTMLButtonElement);
    expect(scope.state.fit).toHaveBeenCalled();
    expect(scope.state.nodes.every((node) => Number.isFinite(node.position.x))).toBe(true);
  });
}

export function registerAutoAlignsUsingMeasuredHandlesAndPreservesPositionsDataAndConnectionsThroughSaveAndRel(
  scope: RootTestRegistrationsTestScope,
): void {
  it('auto-aligns using measured handles and preserves positions, data and connections through save and reload', () => {
    scope.state.original = {
      nodes: ['if', 'left', 'right'].map((id) => ({
        id,
        data: { label: id, custom: { retained: true } },
        position: { x: 0, y: 0 },
        measured: { width: 256, height: 100 },
      })),
      edges: [
        { id: 'left-edge', source: 'if', target: 'left', sourceHandle: 'yes', targetHandle: 'input' },
        { id: 'right-edge', source: 'if', target: 'right', sourceHandle: 'no', targetHandle: 'input' },
      ],
    };
    scope.state.internalNode.mockImplementation((id: string) =>
      id === 'if'
        ? {
            internals: {
              handleBounds: {
                source: [
                  { id: 'no', x: 256 },
                  { id: 'yes', x: 0 },
                ],
              },
            },
          }
        : undefined,
    );
    const original = scope.state.original;
    const view = scope.show();
    fireEvent.click(document.querySelector('svg.lucide-layout-grid')?.closest('button') as HTMLButtonElement);
    const byId = Object.fromEntries(scope.state.nodes.map((node) => [node.id, node]));
    expect(byId.left.position.x).toBeLessThan(byId.right.position.x);
    expect(scope.state.edges).toEqual(scope.state.original.edges);

    // Model a server round trip with serialized data and a fresh page mount.
    scope.state.save.mockImplementationOnce(({ requestBody }: { requestBody: { nodes: Node[]; edges: Edge[] } }) => {
      scope.state.original = JSON.parse(JSON.stringify(requestBody));
    });
    const aligned = structuredClone({ nodes: scope.state.nodes, edges: scope.state.edges });
    fireEvent.click(scope.saveButton());
    expect(scope.state.save).toHaveBeenCalledWith({ resourceId: 7, requestBody: aligned });
    view.unmount();
    scope.show();
    expect(scope.state.nodes).toEqual(aligned.nodes);
    expect(scope.state.nodes.map((node) => node.data)).toEqual(original.nodes.map((node) => node.data));
    expect(scope.state.edges).toEqual(original.edges);
    expect(scope.saveButton()).toBeDisabled();
  });
}

export function registerDetectsChangedEdgeS(scope: RootTestRegistrationsTestScope): void {
  it.each(['source', 'target', 'identity', 'count'] as const)('detects changed edge %s', (change) => {
    scope.show();
    act(() =>
      scope.state.setEdges((previous) =>
        change === 'count'
          ? []
          : previous.map((edge) => ({
              ...edge,
              ...(change === 'source' ? { source: 'two' } : change === 'target' ? { target: 'one' } : { id: 'other' }),
            })),
      ),
    );
    expect(scope.saveButton()).toBeEnabled();
  });
}

export function registerDetectsChangedNodeSAndSavesTheGraph(scope: RootTestRegistrationsTestScope): void {
  it.each(['type', 'position', 'data', 'identity', 'count'] as const)(
    'detects changed node %s and saves the graph',
    (change) => {
      scope.show();
      act(() =>
        scope.state.setNodes((previous) =>
          change === 'count'
            ? previous.slice(1)
            : previous.map((node, index) =>
                index
                  ? node
                  : {
                      ...node,
                      ...(change === 'type'
                        ? { type: 'other' }
                        : change === 'position'
                          ? { position: { x: 30, y: 10 } }
                          : change === 'data'
                            ? { data: { value: true } }
                            : { id: 'new' }),
                    },
              ),
        ),
      );
      expect(scope.saveButton()).toBeEnabled();
      fireEvent.click(scope.saveButton());
      expect(scope.state.save).toHaveBeenCalledWith({
        resourceId: 7,
        requestBody: { nodes: scope.state.nodes, edges: scope.state.edges },
      });
      act(() => scope.state.options.onSuccess());
      expect(scope.state.invalidate).toHaveBeenCalledWith({ queryKey: ['flow', 7] });
    },
  );
}

export function registerKeepsConfettiOffUntilEnabledDistinguishesFailuresAndClearsAnimationsWhenDisabled(
  scope: RootTestRegistrationsTestScope,
): void {
  it('keeps confetti off until enabled, distinguishes failures and clears animations when disabled', () => {
    const view = scope.show();
    expect(screen.getByRole('checkbox', { name: 'Confetti' })).not.toBeChecked();
    expect(scope.state.createConfetti).not.toHaveBeenCalled();
    act(() => scope.state.live?.({ type: 'flow.start' }));
    expect(scope.state.flowProps.edges[0].animated).toBe(true);
    act(() => scope.state.live?.({ type: 'flow.completed' }));
    expect(scope.state.flowProps.edges[0].animated).toBe(false);
    expect(scope.state.confetti).not.toHaveBeenCalled();
    act(() => {
      scope.state.live?.({ type: 'node.processing.failed' });
      scope.state.live?.({ type: 'flow.completed' });
    });
    expect(scope.state.confetti).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Confetti' }));
    expect(scope.state.createConfetti).toHaveBeenCalledOnce();
    act(() => scope.state.live?.({ type: 'flow.completed' }));
    expect(scope.state.confetti).toHaveBeenCalledWith();
    act(() => {
      scope.state.live?.({ type: 'flow.start' });
      scope.state.live?.({ type: 'node.processing.failed' });
    });
    act(() => scope.state.live?.({ type: 'flow.completed' }));
    expect(scope.state.confetti).toHaveBeenLastCalledWith(expect.objectContaining({ confettiNumber: 2 }));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Confetti' }));
    expect(scope.state.clearConfetti).toHaveBeenCalledOnce();
    expect(scope.state.destroyConfetti).toHaveBeenCalledOnce();
    scope.state.confetti.mockClear();
    act(() => scope.state.live?.({ type: 'flow.completed' }));
    expect(scope.state.confetti).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Confetti' }));
    view.unmount();
    expect(scope.state.clearConfetti).toHaveBeenCalledTimes(2);
    expect(scope.state.destroyConfetti).toHaveBeenCalledTimes(2);
    scope.show();
    expect(screen.getByRole('checkbox', { name: 'Confetti' })).not.toBeChecked();
  });
}

export function registerLoadsSavedNodesAndValidationDisablesSavingUnchangedGraphsAndRestoresPullToRefreshOnUn(
  scope: RootTestRegistrationsTestScope,
): void {
  it('loads saved nodes and validation, disables saving unchanged graphs and restores pull-to-refresh on unmount', () => {
    scope.state.original!.validationErrors = [{ nodeId: 'one', message: 'Missing config' }];
    const view = scope.show();
    expect(scope.state.nodes).toEqual(scope.state.original?.nodes);
    expect(scope.state.validation).toHaveBeenCalledWith([{ nodeId: 'one', message: 'Missing config' }]);
    expect(scope.saveButton()).toBeDisabled();
    expect(scope.state.refresh).toHaveBeenCalledWith(false);
    view.unmount();
    expect(scope.state.refresh).toHaveBeenLastCalledWith(true);
    expect(scope.state.remove).toHaveBeenCalledWith(scope.state.live);
  });
}

export function registerShowsLoadingAndErrorsAndRoutesImportExportActions(scope: RootTestRegistrationsTestScope): void {
  it('shows loading and errors and routes import/export actions', () => {
    scope.state.original = undefined;
    scope.state.fetching = true;
    const view = scope.show();
    expect(screen.getByRole('status', { name: 'loading' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'actions.import' })).toBeDisabled();
    view.unmount();
    scope.state.fetching = false;
    scope.state.failed = true;
    scope.show();
    expect(screen.getByRole('alert', { name: 'loadError' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'actions.import' }));
    fireEvent.click(screen.getByRole('button', { name: 'actions.export' }));
    expect(scope.state.imported).toHaveBeenCalledOnce();
    expect(scope.state.exported).toHaveBeenCalledOnce();
    const error = new Error('Denied');
    act(() => scope.state.options.onError(error));
    expect(scope.state.error).toHaveBeenCalledWith(expect.objectContaining({ error }));
  });
}

export function registerSupportsKeyboardCopyCutPasteSelectAllWithoutHijackingTextInputs(
  scope: RootTestRegistrationsTestScope,
): void {
  it('supports keyboard copy/cut/paste/select-all without hijacking text inputs', () => {
    scope.show();
    fireEvent.keyDown(document.body, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'x', metaKey: true });
    fireEvent.mouseMove(screen.getByTestId('canvas'), { clientX: 200, clientY: 300 });
    fireEvent.keyDown(document.body, { key: 'v', ctrlKey: true });
    expect(scope.state.copy).toHaveBeenCalledOnce();
    expect(scope.state.cut).toHaveBeenCalledOnce();
    expect(scope.state.paste).toHaveBeenCalledWith({ x: 190, y: 280 });
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true });
    expect(scope.state.nodes.every((node) => node.selected)).toBe(true);
    const input = document.createElement('input');
    document.body.append(input);
    fireEvent.keyDown(input, { key: 'c', ctrlKey: true });
    expect(scope.state.copy).toHaveBeenCalledOnce();
    input.remove();
  });
}
