// Plugin steps and slot refresh (ATT-1187): confirm / choose / info before a start, the post-stop
// question over the session summary, Lite card-confirm and feedback patterns.
// FEATURE: application-ui-steps

#include "application.hpp"
#include "../platform.hpp"

#include <atomic>
#include <memory>

#ifdef HAS_LVGL_DISPLAY
#include "../display/ui/ui_slots.hpp"

void Application::setupUiCallbacks()
{
  // Slot changes arrive on the inbound-dispatch task; rebuilding happens on LvglTask. One queued refresh
  // covers any number of updates that land before it runs.
  this->api.setUiSlotsChangedCallback([] {
    static std::atomic<bool> queued{false};
    if (queued.exchange(true)) return;
    Display::asyncCall([](void *) {
      queued = false; // updates that land from now on queue a new refresh
      Display::resourceDetailsScreen.refreshUiSlots();
      Display::resourceListScreen.refreshUiSlots();
    }, nullptr);
  });

  ui::setSlotsExpiredCallback([] {
    Display::resourceDetailsScreen.refreshUiSlots();
    Display::resourceListScreen.refreshUiSlots();
  });

  this->api.setUiStepRequestCallback([this](const ui::StepRequest &step) {
    auto *copy = new ui::StepRequest(step);
    struct Payload { Application *self; ui::StepRequest *step; };
    auto *payload = new Payload{this, copy};
    Display::asyncCall([](void *data) {
      std::unique_ptr<Payload> p(static_cast<Payload *>(data));
      std::unique_ptr<ui::StepRequest> step(p->step);
      p->self->handleUiStepRequest(*step);
    }, payload);
  });

  this->api.setUiStepCancelCallback([this](const std::string &stepId) {
    struct Payload { Application *self; std::string stepId; };
    auto *payload = new Payload{this, stepId};
    Display::asyncCall([](void *data) {
      std::unique_ptr<Payload> p(static_cast<Payload *>(data));
      p->self->handleUiStepCancel(p->stepId);
    }, payload);
  });

  Display::stepModal.setActionCallback([this](const std::string &stepId, const std::string &action, bool isChoice) {
    this->handleUiStepAction(stepId, action, isChoice);
  });
}

void Application::handleUiStepRequest(const ui::StepRequest &step)
{
  // A lost ACK makes the server send the same step again: never reopen or restart one we know.
  if ((this->uiStepOpen && this->uiStep.stepId == step.stepId) || this->lastUiStepId == step.stepId) return;
  // Unparsable, nobody signed in (fail closed), Lite-only kind, or not for what this reader is doing.
  bool accept = !step.dropped && this->unlocked && step.kind != ui::StepKind::CardConfirm;
  if (accept && step.requestId == 0) {
    // Post-stop question: only over the session summary of the user who just ended their session.
    accept = this->sessionSummaryActive;
  } else if (accept) {
    accept = this->pendingActionType == PENDING_ACTION_START_SESSION &&
             this->pendingUiAction == "START_RESOURCE_USAGE_SESSION" &&
             this->api.isCurrentResourceAction(step.requestId) && step.resourceId == this->pendingActionResourceId &&
             !this->hasPendingFormRequest;
  }
  if (!accept) {
    this->rejectUiStep(step);
    return;
  }
  this->uiStepPostStop = step.requestId == 0;
  if (!this->uiStepPostStop) {
    if (this->returnToListAfterAction) {
      this->resourceIsSelected = true;
      this->state = APPLICATION_STATE_UNLOCKED;
      Display::resourceListScreen.hideActionProgress();
      Display::transitionToScreen(&Display::resourceDetailsScreen);
    }
    Display::resourceDetailsScreen.hideActionProgress();
  }
  this->uiStep = step;
  this->uiStepOpen = true;
  Display::stepModal.show(this->uiStep, millis());
}

void Application::rejectUiStep(const ui::StepRequest &step)
{
  // The server holds the START until the step is answered: release it now, not after its timeout.
  this->api.sendUiStepResult(step.stepId.c_str(), "cancel");
  if (step.requestId == 0 || this->pendingActionType != PENDING_ACTION_START_SESSION ||
      !this->api.isCurrentResourceAction(step.requestId))
    return;
  // That START will never be answered now: end its pause and progress instead of waiting for the watchdog.
  this->clearPendingStartLocally();
  Display::showErrorPopup(FirmwareI18n::Message::ActionFailed, FirmwareI18n::Message::PleaseTryAgain);
}

void Application::closeUiStep()
{
  if (this->uiStepOpen) {
    this->lastUiStepId = this->uiStep.stepId;
    // Answered or expired: the summary under the question gets its full time, and the answering touch is no dismissal.
    if (this->uiStepPostStop && this->sessionSummaryVisible) {
      this->sessionSummaryShownAt = millis();
      this->sessionSummaryDismissRequested = false;
      this->sessionSummaryTouchSequence = Display::touchPressSequence;
    }
  }
  this->uiStepOpen = false;
  this->uiStepPostStop = false;
  Display::stepModal.hide();
}

void Application::clearPendingStartLocally()
{
  // Like cancelling a form, minus the form-draft cancel: UI_STEP_RESULT already told the server.
  this->hasPendingFormRequest = false;
  this->formFlowSubmitted = false;
  this->pendingActionType = PENDING_ACTION_NONE;
  this->pendingActionResourceId = 0;
  this->pendingActionProjectId = 0;
  this->pendingActionIsTakeover = false;
  this->hasPendingServerFormFlow = false;
  if (!this->waitingForResourceRefresh) Display::resourceDetailsScreen.hideActionProgress();
  this->finishReaderAction(false);
  if (!this->waitingForResourceRefresh) this->endActionPause();
}

void Application::handleUiStepAction(const std::string &stepId, const std::string &action, bool isChoice)
{
  if (!this->uiStepOpen || stepId != this->uiStep.stepId) return;
  const bool postStop = this->uiStepPostStop;
  const std::string id = this->uiStep.stepId;
  this->closeUiStep();

  if (postStop) {
    // No START to retry: the answer travels as the result's action. Header X and timeouts mean "cancel".
    this->api.sendUiStepResult(id.c_str(), action == "confirm" || action == "ok" ? "ok" : action.c_str());
    return;
  }
  if (action == "cancel") {
    this->api.sendUiStepResult(id.c_str(), "cancel");
    this->clearPendingStartLocally();
    return;
  }
  // Confirm / choose / info: start again with the step id (one message, so no race with the answer).
  this->pendingUiStartedAt = millis();
  this->showReaderActionProgress(this->pendingActionIsTakeover ? FirmwareI18n::Message::TakingOverSession
                                                               : FirmwareI18n::Message::StartingSession);
  this->api.startResourceUsageSession(this->pendingActionResourceId, this->pendingActionProjectId,
                                      this->pendingActionIsTakeover, id.c_str(), isChoice ? action.c_str() : nullptr);
}

void Application::handleUiStepCancel(const std::string &stepId)
{
  // An empty id means "whatever is open" (disconnect, re-authentication).
  if (!this->uiStepOpen || (!stepId.empty() && stepId != this->uiStep.stepId)) return;
  const bool postStop = this->uiStepPostStop;
  this->closeUiStep();
  if (!postStop && this->pendingActionType == PENDING_ACTION_START_SESSION) this->clearPendingStartLocally();
}

void Application::tickUiStep()
{
  if (!this->uiStepOpen || this->uiStep.remainingMs(millis()) > 0) return;
  // Expiry fails closed: nothing starts; the server expires its side on its own.
  const bool postStop = this->uiStepPostStop;
  this->closeUiStep();
  if (!postStop && this->pendingActionType == PENDING_ACTION_START_SESSION) this->clearPendingStartLocally();
}
#endif // HAS_LVGL_DISPLAY

#if defined(HAS_WS2812_LED) && !defined(HAS_LVGL_DISPLAY)
void Application::setupUiCallbacks()
{
  this->api.setUiStepRequestCallback([this](const ui::StepRequest &step) { this->handleLiteStepRequest(step); });
  this->api.setUiStepCancelCallback([this](const std::string &) { this->closeLiteStep(); });
  this->api.setActionResultCallback([this](const API::ActionResult &result) {
    if (result.type != "START_RESOURCE_USAGE_SESSION") return;
    if (!result.success && result.error == "START_BLOCKED") this->showLiteBlocked(result);
    // allow-with-warning: the session started, but the plugin wanted attention.
    else if (result.success && result.warning) LedFeedback::play(this->led, this->beeper, LedFeedback::Pattern::Warning);
  });
}

void Application::handleLiteStepRequest(const ui::StepRequest &step)
{
  if (this->liteStep.isOpenStep(step.stepId)) return; // resent after a lost ACK
  if (!this->liteStep.open(step, this->cardAuthenticationData.username, millis())) {
    // The server holds the START until the step is answered: release it now.
    this->api.sendUiStepResult(step.stepId.c_str(), "cancel");
    return;
  }
  LedFeedback::play(this->led, this->beeper, LedFeedback::Pattern::ConfirmWait, this->liteStep.remainingMs(millis()));
}

void Application::closeLiteStep()
{
  if (this->liteStep.close()) this->led.endConfirmWait();
}

void Application::showLiteBlocked(const API::ActionResult &result)
{
  this->closeLiteStep();
  bool thenBlocked = false;
  const LedFeedback::Pattern pattern = LiteStep::blockedPattern(result.blockCode, thenBlocked);
  LedFeedback::play(this->led, this->beeper, pattern, 0, thenBlocked);
}
#endif
