#include "../app_runtime.hpp"

namespace app::runtime {

#ifndef HAS_LVGL_DISPLAY
bool AppRuntime::handleNonDisplayActionFlow() {
  SessionController::NonDisplayFlowDecision nonDisplayDecision =
      sessionController_.evaluateNonDisplayFlow(
          state_.state == AppRuntimeState::APPLICATION_STATE_AUTHENTICATE_CARD,
          state_.state == AppRuntimeState::APPLICATION_STATE_WAIT_FOR_CARD,
          state_.cardDetected, state_.unlocked, state_.cardRemoved);
  if (nonDisplayDecision.shouldReturnEarly) {
    return true;
  }
  if (nonDisplayDecision.shouldProcessAction) {
    logger_.debug("Card detected and removed and unlocked, processing");
    state_.unlocked = false;
    state_.cardDetected = false;
    state_.cardRemoved = false;

    SessionController::NonDisplayActionType actionType =
        sessionController_.selectNonDisplayAction(
            state_.resourceIsDoor, state_.cardPresentationWasLong);
    switch (actionType) {
    case SessionController::NON_DISPLAY_ACTION_LOCK_DOOR:
      api_.lockDoor(state_.selectedResourceId);
      break;
    case SessionController::NON_DISPLAY_ACTION_UNLOCK_DOOR:
      api_.unlockDoor(state_.selectedResourceId);
      break;
    case SessionController::NON_DISPLAY_ACTION_STOP_SESSION:
      api_.stopResourceUsageSession(state_.selectedResourceId);
      break;
    case SessionController::NON_DISPLAY_ACTION_START_SESSION:
      api_.startResourceUsageSession(state_.selectedResourceId);
      break;
    case SessionController::NON_DISPLAY_ACTION_NONE:
    default:
      return true;
    }

    state_.state = AppRuntimeState::APPLICATION_STATE_WAIT_FOR_CARD;
    nfc_.enableCardDetection();
    return true;
  }
  if (nonDisplayDecision.shouldTransitionToWaitForCard) {
    logger_.debug("Waiting for card detection");
    state_.state = AppRuntimeState::APPLICATION_STATE_WAIT_FOR_CARD;
    nfc_.enableCardDetection();
    return true;
  }
  return false;
}
#endif

} // namespace app::runtime
