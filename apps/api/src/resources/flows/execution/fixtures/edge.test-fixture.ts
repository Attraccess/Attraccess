export // Minimal edge shape for our mocks; owner fields are optional and only checked when set
type Edge = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  resourceId?: number | null;
  flowId?: number | null;
};
