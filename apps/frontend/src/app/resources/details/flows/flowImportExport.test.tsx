// Tests for useFlowImportExport: the file-picker import path.
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { ResourceFlowNodeDto, ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import { useFlowImportExport } from './flowImportExport';
import { findUnsupportedNodeTypes, type FlowOwner } from './flowOwner';

const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: toastSuccess, error: toastError }),
}));

const t = (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key);

function Harness({
  onResult,
  findUnsupportedNodes,
}: {
  onResult: (r: { nodes: unknown[]; edges: unknown[] }) => void;
  findUnsupportedNodes?: (nodes: ResourceFlowNodeDto[]) => string[];
}) {
  const { handleImportClick } = useFlowImportExport({
    nodes: [],
    edges: [],
    setNodes: (n) => onResult({ nodes: n as unknown[], edges: [] }),
    setEdges: (e) => onResult({ nodes: [], edges: e as unknown[] }),
    resourceId: 1,
    findUnsupportedNodes,
    t,
  });
  return <button onClick={handleImportClick}>import</button>;
}

async function runImport(json: string, findUnsupportedNodes?: (nodes: ResourceFlowNodeDto[]) => string[]) {
  const results: { nodes: unknown[]; edges: unknown[]; setCalls: number } = { nodes: [], edges: [], setCalls: 0 };
  const { getByText } = render(
    <Harness
      findUnsupportedNodes={findUnsupportedNodes}
      onResult={(r) => {
        results.setCalls += 1;
        if (r.nodes.length) results.nodes = r.nodes;
        if (r.edges.length) results.edges = r.edges;
      }}
    />,
  );
  getByText('import').click();

  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).toBeTruthy();

  const file = new File([json], 'flow.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));

  return { results };
}

const NODE = (id: string, type: string) => ({ id, type, position: { x: 0, y: 0 }, data: {} });

describe('useFlowImportExport - import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('imports a flow with fresh ids and remapped edges', async () => {
    const json = JSON.stringify({
      version: 1,
      nodes: [NODE('a', 'input.button'), NODE('b', 'processing.if')],
      edges: [{ id: 'e1', source: 'a', target: 'b', sourceHandle: 'output', targetHandle: 'input' }],
    });

    const { results } = await runImport(json);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(results.nodes).toHaveLength(2);
    expect(results.edges).toHaveLength(1);
    // ids are regenerated, topology preserved
    const ids = (results.nodes as { id: string }[]).map((n) => n.id);
    expect(ids).not.toContain('a');
    const edge = (results.edges as { source: string; target: string }[])[0];
    expect(ids).toContain(edge.source);
    expect(ids).toContain(edge.target);
  });

  it('imports the real 83-node Bambu flow shape without error', async () => {
    const nodes = Array.from({ length: 83 }, (_, i) => NODE(`n${i}`, 'processing.if'));
    const edges = Array.from({ length: 82 }, (_, i) => ({
      id: `e${i}`,
      source: `n${i}`,
      target: `n${i + 1}`,
      sourceHandle: 'output-true',
      targetHandle: 'input',
    }));
    const { results } = await runImport(JSON.stringify({ version: 1, nodes, edges }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();
    expect(results.nodes).toHaveLength(83);
    expect(results.edges).toHaveLength(82);
  });

  it('reports an error when crypto.randomUUID is unavailable (insecure context)', async () => {
    const original = globalThis.crypto.randomUUID;
    // Simulate a non-secure context (e.g. the dev server reached over http://<lan-ip>)
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });

    const json = JSON.stringify({ version: 1, nodes: [NODE('a', 'input.button')], edges: [] });
    await runImport(json);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();

    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true });
  });

  describe('unsupported nodes', () => {
    const schema = (type: string, supportedByResource: boolean, scopes: Array<'resource' | 'global'>) =>
      ({ type, supportedByResource, supportedFlowScopes: scopes }) as unknown as ResourceFlowNodeSchemaDto;
    const schemas = [
      schema('input.button', true, ['resource']),
      schema('processing.if', true, ['resource', 'global']),
      schema('output.plugin.door', false, ['resource', 'global']),
    ];
    const titles: Record<string, string> = { 'input.button': 'Button', 'output.plugin.door': 'Door' };
    // Mirrors the editor: the catalogue rules, mapped to display names.
    const finderFor = (owner: FlowOwner) => (nodes: ResourceFlowNodeDto[]) =>
      findUnsupportedNodeTypes(nodes, schemas, owner).map((type) => titles[type] ?? type);

    it('rejects a node the global scope does not support, names it and loads nothing', async () => {
      const json = JSON.stringify({
        version: 1,
        nodes: [NODE('a', 'input.button'), NODE('b', 'processing.if'), NODE('c', 'input.button')],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
      });

      const { results } = await runImport(json, finderFor({ kind: 'global', flowId: 3 }));

      await waitFor(() => expect(toastError).toHaveBeenCalled());
      expect(toastError).toHaveBeenCalledWith({
        title: 'import.error.title',
        description: `import.errors.unsupportedNodes ${JSON.stringify({ nodes: 'Button' })}`,
      });
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(results.setCalls).toBe(0);
    });

    it('rejects a node the resource does not support, like the catalogue does', async () => {
      const json = JSON.stringify({ version: 1, nodes: [NODE('a', 'output.plugin.door')], edges: [] });

      const { results } = await runImport(json, finderFor({ kind: 'resource', resourceId: 1 }));

      await waitFor(() => expect(toastError).toHaveBeenCalled());
      expect(toastError.mock.calls[0][0].description).toContain('Door');
      expect(results.setCalls).toBe(0);
    });

    it('rejects a node type without a schema', async () => {
      const json = JSON.stringify({ version: 1, nodes: [NODE('a', 'input.unknown')], edges: [] });

      const { results } = await runImport(json, finderFor({ kind: 'global', flowId: 3 }));

      await waitFor(() => expect(toastError).toHaveBeenCalled());
      expect(toastError.mock.calls[0][0].description).toContain('input.unknown');
      expect(results.setCalls).toBe(0);
    });

    it('loads a flow whose nodes are all supported', async () => {
      const json = JSON.stringify({ version: 1, nodes: [NODE('a', 'output.plugin.door')], edges: [] });

      const { results } = await runImport(json, finderFor({ kind: 'global', flowId: 3 }));

      await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
      expect(results.nodes).toHaveLength(1);
    });
  });
});
