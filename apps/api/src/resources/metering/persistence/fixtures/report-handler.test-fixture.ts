import { MeteringReport } from '../../../flows/node-executors';
export type Handler = (options: {
  complete: (report: MeteringReport) => Promise<void>;
  kind: string;
  meterId: number;
}) => Promise<void>;
