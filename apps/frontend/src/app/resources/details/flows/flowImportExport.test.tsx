// Tests for useFlowImportExport: the file-picker import path.
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { useFlowImportExport } from './flowImportExport';

const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: toastSuccess, error: toastError }),
}));

function Harness({ onResult }: { onResult: (r: { nodes: unknown[]; edges: unknown[] }) => void }) {
  const { handleImportClick } = useFlowImportExport({
    nodes: [],
    edges: [],
    setNodes: (n) => onResult({ nodes: n as unknown[], edges: [] }),
    setEdges: (e) => onResult({ nodes: [], edges: e as unknown[] }),
    resourceId: 1,
    t: (k: string) => k,
  });
  return <button onClick={handleImportClick}>import</button>;
}

async function runImport(json: string) {
  const results: { nodes: unknown[]; edges: unknown[] } = { nodes: [], edges: [] };
  const { getByText } = render(
    <Harness
      onResult={(r) => {
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
});
