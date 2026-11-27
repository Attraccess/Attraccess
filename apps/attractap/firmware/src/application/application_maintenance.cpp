// "Report a problem" and the "Is the machine OK?" check before the card holder's own session ends. The answer of the
// check travels with the stop, and with its resend after the end forms.
// FEATURE: application-maintenance

#include "application.hpp"
#include "../platform.hpp"

#ifdef HAS_LVGL_DISPLAY
bool Application::asksMaintenanceCheck(uint32_t usageId) const {
  // Only a list personalised for the card holder knows the flag and which session is theirs.
  if (this->cardAuthenticationData.username != this->resourceList.authenticatedUsername) return false;
  for (uint16_t i = 0; i < this->resourceList.count; ++i) {
    const auto &resource = this->resourceList.items[i];
    if (resource.id != this->selectedResourceId) continue;
    // Never for a force-stop of somebody else's session.
    return resource.askMaintenanceCheckOnEnd && resource.hasOwnUsage &&
           (usageId == 0 || usageId == resource.ownUsageId);
  }
  return false;
}

void Application::openMaintenanceCheck(uint32_t usageId) {
  this->maintenanceResourceId = this->selectedResourceId;
  this->maintenanceStopUsageId = usageId;
  Display::maintenanceCheckScreen.configure(
      this->resourceNameOf(this->maintenanceResourceId),
      {[this] { this->continueStopAfterCheck(std::string()); },
       [this] {
         this->openMaintenanceReason(FirmwareI18n::Message::Next, [this](const std::string &reason) {
           this->continueStopAfterCheck(reason);
         });
       },
       [this] { this->cancelMaintenanceInput(); }});
  Display::transitionToScreen(&Display::maintenanceCheckScreen);
}

void Application::openProblemReport() {
  this->maintenanceResourceId = this->selectedResourceId;
  this->openMaintenanceReason(FirmwareI18n::Message::MaintenanceSend,
                              [this](const std::string &reason) { this->sendProblemReport(reason); });
}

void Application::openMaintenanceReason(const FirmwareI18n::Text &confirmLabel,
                                        std::function<void(const std::string &)> onConfirm) {
  Display::maintenanceReasonScreen.configure({this->resourceNameOf(this->maintenanceResourceId), confirmLabel,
                                              std::move(onConfirm), [this] { this->cancelMaintenanceInput(); }});
  Display::transitionToScreen(&Display::maintenanceReasonScreen);
}

// Cancel keeps the session running; nothing is sent.
void Application::cancelMaintenanceInput() {
  this->returnToListAfterAction = false;
  Display::returnFromTransient();
}

void Application::continueStopAfterCheck(const std::string &reason) {
  // Back to the screen the stop came from, then the interrupted stop runs with the answer.
  Display::returnFromTransient();
  if (!this->unlocked || this->selectedResourceId != this->maintenanceResourceId ||
      !this->asksMaintenanceCheck(this->maintenanceStopUsageId)) {
    // The session ended or changed while the question was open: the answer belongs to nothing.
    this->returnToListAfterAction = false;
    return;
  }
  this->pendingActionMaintenanceReason = reason;
  this->maintenanceCheckAnswered = true;
  this->handleResourceDetailsButtonClick({&Display::resourceDetailsScreen,
                                          ResourceDetailsScreen::BUTTON_CLICK_TYPE_STOP_SESSION,
                                          {},
                                          this->maintenanceStopUsageId});
  this->maintenanceCheckAnswered = false;
}

void Application::sendProblemReport(const std::string &reason) {
  Display::returnFromTransient();
  if (!this->unlocked || !this->pendingUiAction.empty() || this->waitingForResourceRefresh ||
      this->selectedResourceId != this->maintenanceResourceId)
    return;
  this->pendingUiAction = "CREATE_MAINTENANCE_REQUEST";
  this->pendingUiResourceId = this->maintenanceResourceId;
  this->pendingUiStartedAt = millis();
  this->returnToListAfterAction = false;
  this->showReaderActionProgress(FirmwareI18n::Message::SendingReport);
  this->beginActionPause();
  this->api.createMaintenanceRequest(this->maintenanceResourceId, reason.c_str());
}

#endif
