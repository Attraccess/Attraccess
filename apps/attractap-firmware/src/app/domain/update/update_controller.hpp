#pragma once

class UpdateController {
public:
  struct ExternalFirmwareUpdateDecision {
    bool shouldHandle = false;
    bool shouldUpdateProgress = false;
    bool shouldTransitionToFirmwareScreen = false;
    bool shouldEnterFirmwareUpdateState = false;
  };

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
