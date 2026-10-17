import { parse as parseCsv } from 'csv-parse/browser/esm';
export async function readPreviewFromFile(file: File, recordCount: number) {
  const fileText = await file.text();

  return await new Promise<string[][]>((resolve, reject) => {
    parseCsv(
      fileText,
      {
        bom: true,
        relax_column_count: true,
        skip_empty_lines: false,
        trim: false,
        to_line: recordCount + 1, // only parse what we need for the preview
      },
      (error, output) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(
          (output ?? []).map((record) =>
            (record as Array<string | number | null | undefined>).map((value) =>
              typeof value === 'string' ? value.replace(/\r$/, '') : `${value ?? ''}`,
            ),
          ),
        );
      },
    );
  });
}
