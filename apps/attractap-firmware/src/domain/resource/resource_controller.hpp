#pragma once

#include <stdint.h>

class ResourceController {
public:
  enum ActionIntent {
    ACTION_INTENT_NONE = 0,
    ACTION_INTENT_START_SESSION,
    ACTION_INTENT_STOP_SESSION,
    ACTION_INTENT_LOCK_DOOR,
    ACTION_INTENT_UNLOCK_DOOR,
    ACTION_INTENT_UNLATCH_DOOR,
    ACTION_INTENT_FLOW_BUTTON,
    ACTION_INTENT_LOGOUT,
  };

  struct ActionIntentDecision {
    bool shouldIgnore = false;
    bool shouldShowActionProgress = false;
    const char *actionProgressMessage = nullptr;
    bool shouldBeginActionPause = false;
    bool shouldSetPendingAction = false;
    int pendingActionType = 0;
    bool shouldResetPendingFormRequest = false;
    bool shouldClearResourceSelection = false;
    bool shouldLock = false;
    bool shouldClearProjectsUser = false;
    bool shouldClearProjectSelection = false;
    bool shouldHideFormsModal = false;
    bool shouldApiStartSession = false;
    bool shouldApiStopSession = false;
    bool shouldApiLockDoor = false;
    bool shouldApiUnlockDoor = false;
    bool shouldApiUnlatchDoor = false;
    bool shouldApiTriggerFlowButton = false;
  };

  struct FormsSubmitDecision {
    bool shouldCancelInstead = false;
    bool shouldStoreSubmissionBuffer = false;
    bool shouldHideFormsModal = false;
    bool shouldShowActionProgress = false;
    const char *actionProgressMessage = nullptr;
    bool shouldSendStartSession = false;
    bool shouldSendStopSession = false;
  };

  struct FormsCancelDecision {
    bool shouldReturnEarly = false;
    bool shouldClearPendingFormRequest = false;
    bool shouldResetPendingAction = false;
    bool shouldHideFormsModal = false;
    bool shouldHideActionProgress = false;
    bool shouldEndActionPause = false;
  };

  struct SessionActionResultDecision {
    bool shouldResetPendingAction = false;
    bool shouldClearPendingFormRequest = false;
    bool shouldHideFormsModal = false;
  };

  struct ResourceAvailabilityDecision {
    bool shouldShowNoResources = false;
    bool shouldAutoSelectSingleResource = false;
    bool shouldUpdateResourceListUi = false;
    bool shouldShowResourceList = false;
    bool shouldReturnEarly = false;
  };

  ResourceAvailabilityDecision
  evaluateResourceAvailability(uint8_t resourceCount, bool resourceIsSelected,
                               bool resourceListUpdated,
                               bool currentlyNoResources,
                               bool currentlyResourceList) const {
    ResourceAvailabilityDecision d;

    if (resourceCount == 0) {
      if (currentlyNoResources) {
        d.shouldReturnEarly = true;
        return d;
      }
      d.shouldShowNoResources = true;
      return d;
    }

    if (resourceCount == 1 && !resourceIsSelected) {
      d.shouldAutoSelectSingleResource = true;
      return d;
    }

    if (resourceCount > 0 && !resourceIsSelected) {
      d.shouldUpdateResourceListUi = resourceListUpdated;
      if (currentlyResourceList) {
        d.shouldReturnEarly = true;
        return d;
      }
      d.shouldShowResourceList = true;
      return d;
    }

    return d;
  }

  ActionIntentDecision evaluateActionIntent(ActionIntent intent,
                                            bool currentlyUnlocked,
                                            uint8_t resourceCount) const {
    ActionIntentDecision d;
    if (!currentlyUnlocked) {
      d.shouldIgnore = true;
      return d;
    }

    switch (intent) {
    case ACTION_INTENT_START_SESSION:
      d.shouldShowActionProgress = true;
      d.actionProgressMessage = "Starte Sitzung";
      d.shouldBeginActionPause = true;
      d.shouldSetPendingAction = true;
      d.pendingActionType = 1;
      d.shouldResetPendingFormRequest = true;
      d.shouldApiStartSession = true;
      return d;
    case ACTION_INTENT_STOP_SESSION:
      d.shouldShowActionProgress = true;
      d.actionProgressMessage = "Beende Sitzung";
      d.shouldBeginActionPause = true;
      d.shouldSetPendingAction = true;
      d.pendingActionType = 2;
      d.shouldResetPendingFormRequest = true;
      d.shouldApiStopSession = true;
      return d;
    case ACTION_INTENT_LOCK_DOOR:
      d.shouldShowActionProgress = true;
      d.actionProgressMessage = "Sperre Tuer";
      d.shouldBeginActionPause = true;
      d.shouldApiLockDoor = true;
      return d;
    case ACTION_INTENT_UNLOCK_DOOR:
      d.shouldShowActionProgress = true;
      d.actionProgressMessage = "Entsperre Tuer";
      d.shouldBeginActionPause = true;
      d.shouldApiUnlockDoor = true;
      return d;
    case ACTION_INTENT_UNLATCH_DOOR:
      d.shouldShowActionProgress = true;
      d.actionProgressMessage = "Oeffne Tuer-Riegel";
      d.shouldBeginActionPause = true;
      d.shouldApiUnlatchDoor = true;
      return d;
    case ACTION_INTENT_FLOW_BUTTON:
      d.shouldShowActionProgress = true;
      d.actionProgressMessage = "Aktion Ausfuehren";
      d.shouldBeginActionPause = true;
      d.shouldApiTriggerFlowButton = true;
      return d;
    case ACTION_INTENT_LOGOUT:
      d.shouldClearResourceSelection = resourceCount > 1;
      d.shouldLock = true;
      d.shouldClearProjectsUser = true;
      d.shouldClearProjectSelection = true;
      d.shouldSetPendingAction = true;
      d.pendingActionType = 0;
      d.shouldResetPendingFormRequest = true;
      d.shouldHideFormsModal = true;
      return d;
    case ACTION_INTENT_NONE:
    default:
      d.shouldIgnore = true;
      return d;
    }
  }

  FormsSubmitDecision evaluateFormsSubmit(int pendingActionType) const {
    FormsSubmitDecision d;
    if (pendingActionType == 0) {
      d.shouldCancelInstead = true;
      return d;
    }
    d.shouldStoreSubmissionBuffer = true;
    d.shouldHideFormsModal = true;
    d.shouldShowActionProgress = true;
    d.actionProgressMessage = "Sende Formular";
    if (pendingActionType == 1) {
      d.shouldSendStartSession = true;
    } else if (pendingActionType == 2) {
      d.shouldSendStopSession = true;
    }
    return d;
  }

  FormsCancelDecision evaluateFormsCancel(bool hasPendingFormRequest) const {
    FormsCancelDecision d;
    if (!hasPendingFormRequest) {
      d.shouldReturnEarly = true;
      return d;
    }
    d.shouldClearPendingFormRequest = true;
    d.shouldResetPendingAction = true;
    d.shouldHideFormsModal = true;
    d.shouldHideActionProgress = true;
    d.shouldEndActionPause = true;
    return d;
  }

  SessionActionResultDecision
  evaluateSessionActionResult(bool isSessionEvent) const {
    SessionActionResultDecision d;
    if (!isSessionEvent) {
      return d;
    }
    d.shouldResetPendingAction = true;
    d.shouldClearPendingFormRequest = true;
    d.shouldHideFormsModal = true;
    return d;
  }
};
