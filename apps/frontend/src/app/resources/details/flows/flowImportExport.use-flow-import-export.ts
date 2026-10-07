import { useCallback, useMemo } from 'react';
import { type Edge, type Node } from '@xyflow/react';
import { useToastMessage } from '../../../../components/toastProvider';
import type { FlowImportExportProps } from './flowImportExport.contracts';
import { buildFlowExport } from './flowImportExport.helpers';
import { parseFlowImport } from './flowImportExport.helpers';
import { INVALID_STRUCTURE_ERROR } from './flowImportExport.state';

export function useFlowImportExport({ nodes, edges, setNodes, setEdges, resourceId, t }: FlowImportExportProps) {
  const toast = useToastMessage();

  const exportFileName = useMemo(() => {
    if (resourceId) {
      return `resource-${resourceId}-flow.json`;
    }
    return 'resource-flow.json';
  }, [resourceId]);

  const handleExport = useCallback(() => {
    try {
      const payload = buildFlowExport(nodes, edges);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exportFileName;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success({
        title: t('export.success.title'),
        description: t('export.success.description'),
      });
    } catch (error) {
      console.error('Failed to export flow:', error);
      toast.error({
        title: t('export.error.title'),
        description: t('export.error.description'),
      });
    }
  }, [edges, exportFileName, nodes, t, toast]);

  const handleImportClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    const host = document.body ?? document.documentElement;
    if (!host) {
      return;
    }

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      input.remove();
    };

    const handleChange = async () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        return;
      }

      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const importedFlow = parseFlowImport(parsed);

        setNodes(importedFlow.nodes as Node[]);
        setEdges(importedFlow.edges as Edge[]);

        toast.success({
          title: t('import.success.title'),
          description: t('import.success.description'),
        });
      } catch (error) {
        console.error('Failed to import flow:', error);
        const errorKey =
          error instanceof SyntaxError
            ? 'invalidJson'
            : error instanceof Error && error.message === INVALID_STRUCTURE_ERROR
              ? 'invalidStructure'
              : 'unknown';

        toast.error({
          title: t('import.error.title'),
          description: t(`import.errors.${errorKey}`),
        });
      } finally {
        cleanup();
      }
    };

    input.addEventListener('change', handleChange, { once: true });
    window.addEventListener(
      'focus',
      () => {
        if (!cleanedUp && !input.files?.length) {
          cleanup();
        }
      },
      { once: true },
    );

    host.appendChild(input);
    input.click();
  }, [setNodes, setEdges, t, toast]);

  return {
    handleExport,
    handleImportClick,
  };
}
