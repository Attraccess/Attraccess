import { MeteringReport } from '../flows/node-executors';
export type Handler = (options: { complete: (report: MeteringReport) => Promise<void>; kind: string }) => Promise<void>;
export const reading =
  (value: string, unit = 'kWh', extra: Partial<Extract<MeteringReport, { kind: 'reading' }>> = {}): Handler =>
  ({ complete }) =>
    complete({ kind: 'reading', value, unit, ...extra });
export const ready: Handler = ({ complete }) => complete({ kind: 'ready' });
