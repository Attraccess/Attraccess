// Minimal edge shape for our mocks; owner fields are optional and only checked when set
export type Edge = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  resourceId?: number | null;
  flowId?: number | null;
};
