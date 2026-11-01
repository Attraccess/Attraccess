// Plugin steps and slot refresh (ATT-1187): confirm / choose / info before a start, the post-stop
// question over the session summary, Lite card-confirm and feedback patterns.
// FEATURE: application-ui-steps

#include "application.hpp"

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
  if (!this->unlocked) return; // nobody is signed in: nothing can be confirmed (fail closed)
  if (step.kind == ui::StepKind::CardConfirm) return; // Lite only; touch readers never advertise it

  if (step.requestId == 0) {
    // Post-stop question: only over the session summary of the user who just ended their session.
    if (!this->sessionSummaryActive) return;
    this->uiStepPostStop = true;
  } else {
    const bool answersPendingStart = this->pendingActionType == PENDING_ACTION_START_SESSION &&
                                     this->pendingUiAction == "START_RESOURCE_USAGE_SESSION" &&
                                     this->api.isCurrentResourceAction(step.requestId) &&
                                     step.resourceId == this->pendingActionResourceId && !this->hasPendingFormRequest;
    if (!answersPendingStart) return;
    this->uiStepPostStop = false;
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

void Application::closeUiStep()
{
  if (this->uiStepOpen) this->lastUiStepId = this->uiStep.stepId;
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
    else if (result.success && result.warning) {
      // allow-with-warning: the session started, but the plugin wanted attention.
      this->led.triggerWarning();
      this->beeper.singleBeep();
    }
  });
}

void Application::handleLiteStepRequest(const ui::StepRequest &step)
{
  if (step.kind != ui::StepKind::CardConfirm || this->liteStepOpen || step.remainingMs(millis()) <= 0) return;
  this->liteStep = step;
  this->liteStepUser = this->cardAuthenticationData.username;
  this->liteStepOpen = true;
  this->led.beginConfirmWait(static_cast<uint32_t>(step.remainingMs(millis())));
  this->beeper.singleBeep();
}

void Application::closeLiteStep()
{
  if (!this->liteStepOpen) return;
  this->liteStepOpen = false;
  this->led.endConfirmWait();
}

void Application::showLiteBlocked(const API::ActionResult &result)
{
  this->closeLiteStep();
  if (result.blockCode == "RESERVED") {
    // Reserved for someone else: the amber half ring, then the blocked flash.
    this->led.triggerReserved(true);
    this->beeper.singleBeep();
  } else {
    this->led.triggerError();
    this->beeper.errorBeep();
  }
}
#endif
