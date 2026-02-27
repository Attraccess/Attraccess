#pragma once

#include <stdint.h>

class SessionController {
public:
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
};
