import { useEffect, useState } from 'react';
import { readPreviewFromFile } from './csv-preview';

export const PREVIEW_ROW_COUNT = 5;

/** Header and first data rows of the selected CSV file; empty while no file is selected or it cannot be parsed. */
export function useCsvPreview(selectedFile: File | null) {
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);

  useEffect(() => {
    if (!selectedFile) {
      setCsvHeaders([]);
      setPreviewRows([]);
      return;
    }

    let cancelled = false;

    const loadPreview = async () => {
      try {
        const rows = await readPreviewFromFile(selectedFile, PREVIEW_ROW_COUNT);
        if (cancelled) return;

        const [headerRow = [], ...dataRows] = rows;
        setCsvHeaders(headerRow);
        setPreviewRows(dataRows);
      } catch {
        if (cancelled) return;
        setCsvHeaders([]);
        setPreviewRows([]);
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
    };
  }, [selectedFile]);

  return { csvHeaders, previewRows };
}
