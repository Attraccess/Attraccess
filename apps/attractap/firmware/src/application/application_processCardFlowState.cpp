#include "application.hpp"
#include "platform.hpp"

bool Application::processCardFlowState()
{
#ifdef HAS_LVGL_DISPLAY
  // Enrollment is a sticky, self-contained sub-flow. Once started it owns the
  // screen until success, cancel or timeout — the generic routing below must
  // never run while enrolling, otherwise the enrollment screen gets stolen.
  if (this->externalState ==
          EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO &&
      this->state != APPLICATION_STATE_ENROLLMENT) {
    this->beginEnrollment();
    return true;
  }

  if (this->state == APPLICATION_STATE_ENROLLMENT) {
    this->processEnrollment();
    return true;
  }

  // Card reset is a sticky, self-contained sub-flow just like enrollment — it
  // owns the screen until success, cancel or timeout so the generic routing
  // below can never steal the reset screen.
  if (this->externalState == EXTERNAL_STATE_RESET_NFC_CARD &&
      this->state != APPLICATION_STATE_RESET) {
    this->beginReset();
    return true;
  }

  if (this->state == APPLICATION_STATE_RESET) {
    this->processReset();
    return true;
  }

  // The server can arm supervision without anyone tapping first (ATT-816): the requester picked this
  // reader in the web UI. Enrollment and reset return before this point, so the flag may sit unread
  // for as long as one of those runs — check it against the server's TTL rather than assuming the
  // request is still live, and tell the server when we cannot serve it.
  if (this->supervision.takePendingWebStart(
          millis(), this->state == APPLICATION_STATE_SUPERVISION ||
                         this->cardAuthenticationPending || this->unlocked ||
                         this->state == APPLICATION_STATE_AUTHENTICATE_CARD)) {
    this->state = APPLICATION_STATE_SUPERVISION;
    this->externalState = EXTERNAL_STATE_NONE;
    return true;
  }

  // Two-card supervision is a sticky, self-contained sub-flow like enrollment/reset — it owns the
  // screen until success, cancel or timeout.
  if (this->state == APPLICATION_STATE_SUPERVISION) {
    SupervisionFlow::Outcome outcome = this->supervision.tick(millis());
    if (outcome != SupervisionFlow::Outcome::None) {
      this->externalState = EXTERNAL_STATE_NONE;
      this->state = APPLICATION_STATE_INIT;
      const bool hadLogin = this->unlocked;
      this->unlocked = hadLogin || outcome == SupervisionFlow::Outcome::Unlock ||
                       outcome == SupervisionFlow::Outcome::UnlockAndStartSession;
      if (outcome == SupervisionFlow::Outcome::UnlockAndStartSession) {
        this->pendingUiStartedAt = millis();
        this->showReaderActionProgress("Nutzung wird gestartet");
        if (this->actionInProgressCount == 0) this->beginActionPause();
        this->pendingActionType = PENDING_ACTION_START_SESSION;
        this->pendingActionResourceId = this->selectedResourceId;
        this->pendingActionProjectId = this->selectedProjectId;
        this->pendingActionIsTakeover = false;
        this->hasPendingFormRequest = false;
        this->api.startResourceUsageSession(this->selectedResourceId, this->selectedProjectId);
      } else if (hadLogin) {
        this->finishReaderAction(outcome == SupervisionFlow::Outcome::Unlock);
      }

    }
    return true;
  }
#endif

  return false;
}
