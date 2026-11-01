// What the reader shows when something did not work or is done: status screens over the
// current screen, errors in place on the button that started an action, and which server
// errors get any UI at all.
// FEATURE: application-session

#include "application.hpp"

#ifdef HAS_LVGL_DISPLAY
Application::RoutingKey Application::routingKey() const {
  return {this->state, this->unlocked, this->resourceIsSelected, this->selectedResourceId};
}

void Application::showStatus(StatusScreen::Config config, bool resumeRouting) {
  config.onDismiss = [this, resumeRouting] {
    this->statusHeld = false;
    if (resumeRouting || !Display::returnFromTransient()) this->rerouteRequested = true;
  };
  this->statusHeld = true;
  this->statusHoldKey = this->routingKey();
  Display::showStatus(std::move(config));
}

bool Application::dismissSignedOutStatus() {
  if (!this->statusHeld || this->unlocked || !Display::isActive(&Display::statusScreen)) return false;
  const auto purpose = Display::statusScreen.purpose();
  const IScreen *origin = Display::transientOrigin();
  // "Sign-in failed" only over the screens a card signs in from; "status unavailable" follows a
  // logout, so its origin is a signed-in screen that must not come back.
  const bool signInOrigin = origin == &Display::lockscreen || origin == &Display::resourceListScreen;
  if (!(purpose == StatusScreen::Purpose::SignInFailed && signInOrigin) && purpose != StatusScreen::Purpose::StatusUnavailable)
    return false;
  this->statusHeld = false;
  this->state = this->resourceIsSelected ? APPLICATION_STATE_LOCKED : APPLICATION_STATE_RESOURCE_LIST;
  Display::resourceListScreen.setAuthenticatedUser("");
  Display::transitionToScreen(this->resourceIsSelected ? static_cast<IScreen *>(&Display::lockscreen) : &Display::resourceListScreen);
  return true;
}

std::string Application::resourceNameOf(uint32_t resourceId) const {
  for (uint16_t i = 0; i < this->resourceList.count; ++i)
    if (this->resourceList.items[i].id == resourceId) return this->resourceList.items[i].name;
  return std::string();
}

void Application::showActionFailure(uint32_t resourceId, const std::string &errorCode, const FirmwareI18n::Text &preferred,
                                    bool returnToList) {
  // The raw server error is for the log; the screen only shows text the reader can localize.
  this->logger.errorf("Action failed: %s", errorCode.c_str());
  this->beeper.errorBeep();
  // An action started from the list (its form may have opened the details) fails on its row.
  if (returnToList && !this->resourceIsSelected && Display::isActive(&Display::resourceDetailsScreen)) {
    this->state = APPLICATION_STATE_RESOURCE_LIST_AUTHENTICATED;
    Display::resourceListScreen.setAuthenticatedUser(this->cardAuthenticationData.username);
    Display::transitionToScreen(&Display::resourceListScreen);
  }
  FirmwareI18n::Text text = preferred.empty() ? FirmwareI18n::knownReaderError(errorCode) : preferred;
  if (text.empty()) text = FirmwareI18n::Message::ActionFailedTapToRetry;
  bool shown = false;
  if (Display::isActive(&Display::resourceDetailsScreen)) shown = Display::resourceDetailsScreen.showActionError(text);
  else if (Display::isActive(&Display::resourceListScreen)) shown = Display::resourceListScreen.showActionError(resourceId, text);
  if (!shown) {
    const FirmwareI18n::Text known = FirmwareI18n::knownReaderError(errorCode);
    this->showStatus(StatusScreen::generic(known.empty() ? FirmwareI18n::Text(FirmwareI18n::Message::PleaseTryAgain) : known, errorCode));
  }
}

void Application::reportActionFailure(const API::ActionResult &result, uint32_t resourceId, bool returnToList) {
  if (result.error == "INSUFFICIENT_BALANCE" && result.sumUpEnabled) {
    this->beeper.errorBeep();
    this->openTopUp();
  } else if (result.error == "INSUFFICIENT_BALANCE") {
    this->beeper.errorBeep();
    this->showStatus(StatusScreen::warning(FirmwareI18n::Message::InsufficientBalance, FirmwareI18n::readerError("INSUFFICIENT_BALANCE")), returnToList);
  } else {
    this->showActionFailure(resourceId, result.error, FirmwareI18n::Text(), returnToList);
  }
}

// The server refuses a usage form's fields or page with START_RESOURCE_USAGE_SESSION {"error"} and
// no request id, for start and stop forms alike (the forms handler's resource-action guard).
void Application::handleFormFlowError(const API::ActionResult &result) {
  this->logger.errorf("Usage form refused: %s", result.error.c_str());
  if (this->formPageSubmitPending && Display::isActive(&Display::formsScreen)) {
    // The page could not be taken: stay on the form, in place on Next/Submit.
    this->formPageSubmitPending = false;
    this->beeper.errorBeep();
    const FirmwareI18n::Text known = FirmwareI18n::knownReaderError(result.error);
    Display::formsScreen.showSubmitError(known.empty() ? FirmwareI18n::Text(FirmwareI18n::Message::ActionFailedTapToRetry) : known);
    return;
  }
  // The fields could not be loaded: the form closes and the button that opened it says why.
  const uint32_t resourceId = this->pendingUiResourceId;
  const bool returnToList = this->returnToListAfterAction;
  this->handleFormsCancel();
  this->reportActionFailure(result, resourceId, returnToList);
}

void Application::showSignInFailed(const FirmwareI18n::Text &message) {
  StatusScreen::Config config = StatusScreen::error(FirmwareI18n::Message::SignInFailed, message);
  config.purpose = StatusScreen::Purpose::SignInFailed;
  this->showStatus(std::move(config));
}

void Application::handleReaderError(const std::string &eventType, const std::string &code) {
  const FirmwareI18n::Text known = FirmwareI18n::knownReaderError(code);
  const FirmwareI18n::Text retry = known.empty() ? FirmwareI18n::Text(FirmwareI18n::Message::ActionFailedTapToRetry) : known;
  if (eventType == "CARD_AUTHENTICATION_DATA") {
    // Only a sign-in in progress is answered on screen; anything else is stale.
    const bool signingIn = !this->unlocked && (this->cardAuthenticationPending || this->state == APPLICATION_STATE_LOCKED ||
                                               this->state == APPLICATION_STATE_RESOURCE_LIST);
    if (this->cardAuthenticationPending) this->finishCardAuthentication(false);
    if (!signingIn) return;
    this->beeper.errorBeep();
    this->nfc.enableCardDetection();
    this->showSignInFailed(FirmwareI18n::readerError(code));
  } else if (eventType == "BILLING_REQUEST_TOPUP") {
    // The top-up request was refused: back to the amount, with the reason on "Top up". Only for
    // the request this reader is waiting on, and never over another flow.
    if (!this->topUpPending) return;
    this->topUpPending = false;
    const bool elsewhere = this->hasPendingFormRequest || Display::isActive(&Display::formsScreen) ||
                           Display::isActive(&Display::projectSelectScreen) || Display::isActive(&Display::confirmScreen) ||
                           (this->state != APPLICATION_STATE_UNLOCKED && this->state != APPLICATION_STATE_RESOURCE_LIST_AUTHENTICATED &&
                            this->state != APPLICATION_STATE_TOP_UP);
    if (!this->unlocked || elsewhere) return;
    this->beeper.errorBeep();
    this->openTopUp(true);
    Display::topUpScreen.showError(retry);
  } else if (eventType == "PROJECTS_OF_USER") {
    this->beeper.errorBeep();
    Display::projectSelectScreen.showLoadError();
  } else if (eventType.rfind("ENROLL_NEW_CARD", 0) == 0) {
    if (Display::isActive(&Display::enrollmentScreen)) {
      this->beeper.errorBeep();
      Display::enrollmentScreen.setStatus(EnrollmentScreen::STATUS_ERROR);
      Display::enrollmentScreen.setStatusMessage(FirmwareI18n::readerError(code));
    }
  } else if (eventType == "RESET_NFC_CARD") {
    if (Display::isActive(&Display::resetScreen)) {
      this->beeper.errorBeep();
      Display::resetScreen.setStatus(ResetScreen::STATUS_ERROR);
      Display::resetScreen.setStatusMessage(FirmwareI18n::readerError(code));
    }
  }
  // Anything else is background traffic (resource list refreshes, language, firmware notices):
  // the API has logged it, and nobody is waiting on it.
}

#endif
