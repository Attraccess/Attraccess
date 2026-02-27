#pragma once

#include <stdint.h>

class SessionController {
public:
  struct LockedStateDecision {
    bool shouldClearResourceSelection = false;
    bool shouldReturnEarly = false;
    bool shouldTransitionToLocked = false;
  };

  struct UnlockedStateDecision {
    bool shouldRelock = false;
    bool keepResourceSelectedOnRelock = false;
  };

  enum NonDisplayActionType {
    NON_DISPLAY_ACTION_NONE = 0,
    NON_DISPLAY_ACTION_LOCK_DOOR,
    NON_DISPLAY_ACTION_UNLOCK_DOOR,
    NON_DISPLAY_ACTION_STOP_SESSION,
    NON_DISPLAY_ACTION_START_SESSION,
  };

  struct NonDisplayFlowDecision {
    bool shouldReturnEarly = false;
    bool shouldProcessAction = false;
    bool shouldTransitionToWaitForCard = false;
  };

  struct LogoutDecision {
    bool shouldClearResourceSelection = false;
    bool shouldLock = true;
    bool shouldClearProjectsUser = true;
    bool shouldClearProjectSelection = true;
    bool shouldResetPendingAction = true;
    bool shouldClearPendingFormRequest = true;
    bool shouldHideFormsModal = true;
  };

  struct DisconnectResetDecision {
    bool shouldResetSession = false;
    bool shouldHideActionProgress = true;
    bool shouldHideFormsModal = true;
    bool shouldResetPauseAccounting = true;
    bool shouldResetPendingAction = true;
    bool shouldClearPendingFormRequest = true;
    bool shouldClearProjectSelection = true;
    bool shouldClearProjectsUser = true;
    bool shouldClearSelection = true;
    bool shouldLock = true;
    bool shouldClearExternalState = true;
    bool shouldEnableCardDetection = true;
  };

  LockedStateDecision
  evaluateLockedState(bool unlocked, bool currentlyLocked, uint32_t nowMs,
                      uint32_t selectedAtMs, uint32_t selectionTimeoutMs) const {
    LockedStateDecision d;
    if (unlocked) {
      return d;
    }
    if (currentlyLocked) {
      d.shouldReturnEarly = true;
      d.shouldClearResourceSelection =
          this->shouldExpireResourceSelection(nowMs, selectedAtMs,
                                              selectionTimeoutMs);
      return d;
    }
    d.shouldTransitionToLocked = true;
    return d;
  }

  UnlockedStateDecision
  evaluateUnlockedState(bool unlocked, bool currentlyUnlocked, uint32_t nowMs,
                        uint32_t unlockedAtMs, uint32_t accumulatedPauseMs,
                        uint32_t unlockedTimeoutMs,
                        uint8_t resourceCount) const {
    UnlockedStateDecision d;
    if (!unlocked || !currentlyUnlocked) {
      return d;
    }
    if (this->shouldAutoRelock(nowMs, unlockedAtMs, accumulatedPauseMs,
                               unlockedTimeoutMs)) {
      d.shouldRelock = true;
      d.keepResourceSelectedOnRelock =
          this->shouldKeepResourceSelectedOnRelock(resourceCount);
    }
    return d;
  }

  NonDisplayFlowDecision
  evaluateNonDisplayFlow(bool currentlyAuthenticateCard, bool currentlyWaitForCard,
                         bool cardDetected, bool unlocked,
                         bool cardRemoved) const {
    NonDisplayFlowDecision d;
    if (currentlyAuthenticateCard) {
      if (!cardDetected || !unlocked || !cardRemoved) {
        d.shouldReturnEarly = true;
        return d;
      }
      d.shouldProcessAction = true;
      return d;
    }
    if (!currentlyWaitForCard) {
      d.shouldTransitionToWaitForCard = true;
      return d;
    }
    return d;
  }

  NonDisplayActionType selectNonDisplayAction(bool resourceIsDoor,
                                              bool cardPresentationWasLong) const {
    if (resourceIsDoor) {
      return cardPresentationWasLong ? NON_DISPLAY_ACTION_LOCK_DOOR
                                     : NON_DISPLAY_ACTION_UNLOCK_DOOR;
    }
    return cardPresentationWasLong ? NON_DISPLAY_ACTION_STOP_SESSION
                                   : NON_DISPLAY_ACTION_START_SESSION;
  }

  LogoutDecision evaluateLogout(uint8_t resourceCount) const {
    LogoutDecision d;
    d.shouldClearResourceSelection =
        this->shouldClearResourceSelectionOnLogout(resourceCount);
    return d;
  }

  DisconnectResetDecision
  evaluateDisconnectReset(bool unlocked, bool resourceIsSelected,
                          bool hasPendingAction, bool hasPendingFormRequest,
                          bool pendingFormRequestReady,
                          bool hasCurrentProjectsUser) const {
    DisconnectResetDecision d;
    d.shouldResetSession = this->isSessionActive(
        unlocked, resourceIsSelected, hasPendingAction, hasPendingFormRequest,
        pendingFormRequestReady, hasCurrentProjectsUser);
    return d;
  }

  bool shouldExpireResourceSelection(uint32_t nowMs, uint32_t selectedAtMs,
                                     uint32_t selectionTimeoutMs) const {
    return nowMs - selectedAtMs > selectionTimeoutMs;
  }

  bool shouldAutoRelock(uint32_t nowMs, uint32_t unlockedAtMs,
                        uint32_t accumulatedPauseMs,
                        uint32_t unlockedTimeoutMs) const {
    uint32_t effectiveElapsed = nowMs - unlockedAtMs;
    if (effectiveElapsed > accumulatedPauseMs) {
      effectiveElapsed -= accumulatedPauseMs;
    } else {
      effectiveElapsed = 0;
    }
    return effectiveElapsed > unlockedTimeoutMs;
  }

  bool shouldKeepResourceSelectedOnRelock(uint8_t resourceCount) const {
    return resourceCount == 1;
  }

  bool shouldClearResourceSelectionOnLogout(uint8_t resourceCount) const {
    return resourceCount > 1;
  }

  bool isSessionActive(bool unlocked, bool resourceIsSelected,
                       bool hasPendingAction, bool hasPendingFormRequest,
                       bool pendingFormRequestReady,
                       bool hasCurrentProjectsUser) const {
    return unlocked || resourceIsSelected || hasPendingAction ||
           hasPendingFormRequest || pendingFormRequestReady ||
           hasCurrentProjectsUser;
  }

  bool shouldPauseSessionTimeoutOnActionBegin(
      uint16_t actionInProgressCount) const {
    return actionInProgressCount == 1;
  }

  bool shouldIgnoreActionPauseEnd(uint16_t actionInProgressCount) const {
    return actionInProgressCount == 0;
  }

  bool shouldApplyPauseDeltaOnActionEnd(uint16_t actionInProgressCount) const {
    return actionInProgressCount == 0;
  }

  uint32_t computePauseDeltaMs(uint32_t nowMs, uint32_t pauseStartMs) const {
    return (nowMs >= pauseStartMs) ? (nowMs - pauseStartMs) : 0;
  }

  uint32_t computeSessionTimeoutDeadlineMs(uint32_t nowMs,
                                           uint32_t unlockedTimeoutMs) const {
    return nowMs + unlockedTimeoutMs;
  }

  void resetPauseAccounting(uint32_t &pauseStartMs, uint32_t &accumulatedPauseMs,
                            uint16_t &actionInProgressCount) const {
    pauseStartMs = 0;
    accumulatedPauseMs = 0;
    actionInProgressCount = 0;
  }
};
