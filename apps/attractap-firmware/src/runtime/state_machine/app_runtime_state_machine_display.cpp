#include "../app_runtime.hpp"

namespace app::runtime {

#ifdef HAS_LVGL_DISPLAY
namespace {
constexpr uint32_t APPLICATION_BOOT_SCREEN_DURATION_MS = 2000;
}

bool AppRuntime::handleDisplayBootAndPinGates() {
  bool bootJustCompleted = false;
  if (!state_.bootDone &&
      system_.nowMs() - state_.bootTime > APPLICATION_BOOT_SCREEN_DURATION_MS) {
    logger_.debug("Boot screen duration reached, hiding boot screen");
    state_.bootDone = true;
    bootJustCompleted = true;
  }

  if (!state_.bootDone) {
    return true;
  }

  bool pinIsSet = settings_.getDeviceConfig().passCode != "0000";
  if (bootJustCompleted && pinIsSet &&
      state_.state == AppRuntimeState::APPLICATION_STATE_INIT) {
    logger_.debug("Boot screen complete, showing init screen");
    ui_.transitionToInitScreen();
  }

  if (pinIsSet) {
    return false;
  }
  if (state_.state == AppRuntimeState::APPLICATION_STATE_PIN_NOT_SET) {
    return true;
  }

  logger_.debug("PIN is not set, showing pin screen");
  state_.state = AppRuntimeState::APPLICATION_STATE_PIN_NOT_SET;
  ui_.transitionToSetPinScreen();
  return true;
}

bool AppRuntime::handleEnrollmentTransitions() {
  AuthController::EnrollGetAvailableTransitionDecision enrollGetAvailableDecision =
      authController_.evaluateEnrollGetAvailableTransition(
          state_.externalState ==
              AppRuntimeState::EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO,
          state_.state == AppRuntimeState::APPLICATION_STATE_ENROLLMENT,
          system_.nowMs(),
          state_.apiEnrollNewCardGetAvailableKeyNoStartTimeMs, 30000);
  if (enrollGetAvailableDecision.shouldHandle) {
    if (enrollGetAvailableDecision.shouldTimeout) {
      logger_.error(
          "Enroll new card get available key number timeout reached");
      state_.externalState = AppRuntimeState::EXTERNAL_STATE_NONE;
      return true;
    }
    if (enrollGetAvailableDecision.shouldTryGetAvailableKeyNo) {
      uint8_t uid[7] = {0};
      uint8_t uidLength = 0;
      uint8_t keyNo = 0;
      bool success = nfc_.getAvailableKeyNo(uid, &uidLength, &keyNo);
      AuthController::EnrollAvailableKeyReadDecision keyReadDecision =
          authController_.evaluateEnrollAvailableKeyRead(success);
      if (keyReadDecision.shouldSendAvailableKeyNo) {
        api_.sendEnrollNewCardAvailableKeyNo(uid, uidLength, keyNo);
      }
      if (keyReadDecision.shouldClearExternalState) {
        state_.externalState = AppRuntimeState::EXTERNAL_STATE_NONE;
      }
      return true;
    }
    if (enrollGetAvailableDecision.shouldPrepareEnrollment) {
      nfc_.disableCardDetection();
      ui_.enrollmentSetUserName(
          state_.apiEnrollNewCardGetAvailableKeyNoData.username);
      state_.apiEnrollNewCardGetAvailableKeyNoStartTimeMs = system_.nowMs();
      ui_.enrollmentSetTimeoutTime(
          state_.apiEnrollNewCardGetAvailableKeyNoStartTimeMs + 30000);
      ui_.transitionToEnrollmentScreen();
    }
    if (enrollGetAvailableDecision.shouldEnterEnrollmentState) {
      state_.state = AppRuntimeState::APPLICATION_STATE_ENROLLMENT;
    }
    return true;
  }

  AuthController::EnrollNewCardTransitionDecision enrollNewCardDecision =
      authController_.evaluateEnrollNewCardTransition(
          state_.externalState == AppRuntimeState::EXTERNAL_STATE_ENROLL_NEW_CARD,
          state_.state == AppRuntimeState::APPLICATION_STATE_ENROLLMENT);
  if (!enrollNewCardDecision.shouldHandle) {
    return false;
  }
  if (enrollNewCardDecision.shouldEnableCardDetection) {
    nfc_.enableCardDetection();
  }
  if (enrollNewCardDecision.shouldEnterEnrollmentState) {
    state_.state = AppRuntimeState::APPLICATION_STATE_ENROLLMENT;
  }
  return true;
}
#endif

} // namespace app::runtime
