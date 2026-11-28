// "Report a problem" and the "Is the machine OK?" check before the card holder's own session ends. The answer of the
// check travels with the stop, and with its resend after the end forms.
// FEATURE: application-maintenance

#include "application.hpp"
#include "../platform.hpp"

#ifdef HAS_LVGL_DISPLAY
const API::ResourceBrief *Application::ownSessionToStop(uint32_t usageId) const {
  // Only a list personalised for the card holder knows which session is theirs.
  if (this->cardAuthenticationData.username != this->resourceList.authenticatedUsername) return nullptr;
  for (uint16_t i = 0; i < this->resourceList.count; ++i) {
    const auto &resource = this->resourceList.items[i];
    if (resource.id != this->selectedResourceId) continue;
    // Never a force-stop of somebody else's session.
    return resource.hasOwnUsage && (usageId == 0 || usageId == resource.ownUsageId) ? &resource : nullptr;
  }
  return nullptr;
}

bool Application::asksMaintenanceCheck(uint32_t usageId) const {
  const auto *resource = this->ownSessionToStop(usageId);
  return resource && resource->askMaintenanceCheckOnEnd;
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
  const bool draftFits = this->maintenanceReasonDraftResourceId == this->maintenanceResourceId &&
                         this->maintenanceReasonDraftUser == this->cardAuthenticationData.username;
  Display::maintenanceReasonScreen.configure(
      {this->resourceNameOf(this->maintenanceResourceId), confirmLabel,
       [this, onConfirm = std::move(onConfirm)](const std::string &reason) {
         // Kept until the request is filed, so a failed send or a refused stop can offer it again.
         this->maintenanceReasonDraft = reason;
         this->maintenanceReasonDraftUser = this->cardAuthenticationData.username;
         this->maintenanceReasonDraftResourceId = this->maintenanceResourceId;
         onConfirm(reason);
       },
       [this] { this->cancelMaintenanceInput(); }, draftFits ? this->maintenanceReasonDraft : std::string()});
  Display::transitionToScreen(&Display::maintenanceReasonScreen);
}

void Application::clearMaintenanceReasonDraft() {
  this->maintenanceReasonDraft.clear();
  this->maintenanceReasonDraftUser.clear();
  this->maintenanceReasonDraftResourceId = 0;
}

// Cancel keeps the session running; nothing is sent, and a kept reason is discarded.
void Application::cancelMaintenanceInput() {
  this->returnToListAfterAction = false;
  this->clearMaintenanceReasonDraft();
  Display::returnFromTransient();
}

void Application::continueStopAfterCheck(const std::string &reason) {
  // Back to the screen the stop came from, then the interrupted stop runs with the answer.
  Display::returnFromTransient();
  // Only the session counts here: a setting or license that changed while the question was open must not swallow the
  // stop.
  if (!this->unlocked || this->selectedResourceId != this->maintenanceResourceId ||
      !this->ownSessionToStop(this->maintenanceStopUsageId)) {
    // The session ended or changed while the question was open: there is nothing left to stop.
    this->returnToListAfterAction = false;
    // A typed reason must not vanish without a word.
    if (this->unlocked && !reason.empty())
      this->showStatus(StatusScreen::warning(FirmwareI18n::Message::ReportNotSent,
                                             FirmwareI18n::Message::SessionAlreadyEndedReportAgain));
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
  if (!this->unlocked) return;
  if (!this->pendingUiAction.empty() || this->waitingForResourceRefresh ||
      this->selectedResourceId != this->maintenanceResourceId) {
    // Not sent; the reason is kept for the next try.
    this->showStatus(StatusScreen::warning(FirmwareI18n::Message::ReportNotSent, FirmwareI18n::Message::PleaseTryAgain));
    return;
  }
  this->pendingUiAction = "CREATE_MAINTENANCE_REQUEST";
  this->pendingUiResourceId = this->maintenanceResourceId;
  this->pendingUiStartedAt = millis();
  this->returnToListAfterAction = false;
  this->showReaderActionProgress(FirmwareI18n::Message::SendingReport);
  this->beginActionPause();
  this->api.createMaintenanceRequest(this->maintenanceResourceId, reason.c_str());
}

#endif
