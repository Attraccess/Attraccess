#pragma once

class UpdateController {
public:
  struct FirmwareMetaEventDecision {
    bool shouldSetExternalFirmwareUpdateState = false;
    bool shouldStoreAvailableVersion = false;
  };

  struct FirmwareProgressEventDecision {
    bool shouldSetExternalFirmwareUpdateState = false;
    bool shouldStoreProgress = false;
    bool shouldLogProgress = false;
  };

  struct ExternalFirmwareUpdateDecision {
    bool shouldHandle = false;
    bool shouldUpdateProgress = false;
    bool shouldTransitionToFirmwareScreen = false;
    bool shouldEnterFirmwareUpdateState = false;
  };

  FirmwareMetaEventDecision evaluateFirmwareMetaEvent(
      bool hasPayloadAvailableVersion) const {
    FirmwareMetaEventDecision d;
    if (!hasPayloadAvailableVersion) {
      return d;
    }
    d.shouldSetExternalFirmwareUpdateState = true;
    d.shouldStoreAvailableVersion = true;
    return d;
  }

  FirmwareProgressEventDecision
  evaluateFirmwareProgressEvent(bool hasPayloadProgress) const {
    FirmwareProgressEventDecision d;
    if (!hasPayloadProgress) {
      return d;
    }
    d.shouldSetExternalFirmwareUpdateState = true;
    d.shouldStoreProgress = true;
    d.shouldLogProgress = true;
    return d;
  }

  ExternalFirmwareUpdateDecision evaluateExternalFirmwareUpdateTransition(
      bool externalFirmwareUpdateRequested, bool currentlyInFirmwareUpdateState,
      bool hasDisplay) const {
    ExternalFirmwareUpdateDecision d;
    if (!externalFirmwareUpdateRequested) {
      return d;
    }
    d.shouldHandle = true;
    if (currentlyInFirmwareUpdateState) {
      d.shouldUpdateProgress = true;
      return d;
    }
    d.shouldTransitionToFirmwareScreen = hasDisplay;
    d.shouldEnterFirmwareUpdateState = true;
    return d;
  }
};
