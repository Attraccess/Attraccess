export interface OpenScadInstance {
  callMain(args: string[]): number;
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: string | ArrayBufferView): void;
    readFile(path: string): Uint8Array;
  };
  ENV: Record<string, string>;
}

export type CreateOpenSCAD = (options: {
  noInitialRun?: boolean;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
  instantiateWasm?: (
    imports: WebAssembly.Imports,
    done: (instance: WebAssembly.Instance) => void,
  ) => Record<string, never>;
}) => Promise<OpenScadInstance>;
export interface RenderRequest {
  id: number;
  label: string;
}
export type RenderResponse =
  { id: number; ok: true; body: ArrayBuffer; letters: ArrayBuffer } | { id: number; ok: false; error: string };
