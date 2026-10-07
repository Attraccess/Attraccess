export interface Props {
  resourceId: number;
  supportsOperatingDuration: boolean;
  scheduleId?: number;
  onSaved: () => void;
  onCancel: () => void;
}
