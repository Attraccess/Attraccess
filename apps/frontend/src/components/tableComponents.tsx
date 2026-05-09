import { ProgressCircle, ProgressCircleFillCircle, ProgressCircleTrack, ProgressCircleTrackCircle } from "@heroui/react";

export const TableDataLoadingIndicator = () => {
  return (
    <div className="flex justify-center items-center p-4">
      <ProgressCircle isIndeterminate aria-label="Loading table data">
        <ProgressCircleTrack>
          <ProgressCircleTrackCircle />
          <ProgressCircleFillCircle />
        </ProgressCircleTrack>
      </ProgressCircle>
    </div>
  );
};
