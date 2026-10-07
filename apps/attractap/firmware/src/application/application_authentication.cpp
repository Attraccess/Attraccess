// Session coordination: resource/project selection, action buttons, pause timing
// FEATURE: application-session

#include "application.hpp"
#include "platform.hpp"
#include <cstdlib>
#include <cstring>
#include <string>

#ifdef HAS_LVGL_DISPLAY
void Application::finishReaderAction(bool success) {
  if (this->pendingUiAction.empty()) return;
  const auto type = this->pendingUiAction;
  this->pendingUiAction.clear();
  this->waitingForResourceRefresh = true;
  this->pendingUiStartedAt = millis();
  Display::resourceDetailsScreen.hideFormsModal();
  if (this->returnToListAfterAction) this->resourceIsSelected = false;
  this->actionCompletionMessage = success
      ? type == "START_RESOURCE_USAGE_SESSION" ? "Nutzung gestartet"
      : type == "STOP_RESOURCE_USAGE_SESSION" ? "Nutzung beendet" : "Aktion bestätigt"
      : "";
  // Keep input blocked until fresh ownership/availability arrives, so a fast
  // second tap cannot act on the row's pre-action state.
  this->showReaderActionProgress("Status wird geladen");
  this->api.cancelResourceAction();
  this->resourceRefreshRequestId = this->api.requestResourceList();
}

void Application::logoutReader() {
  Display::hidePopup();
  this->handleFormsCancel();
  this->finishCardAuthentication(false);
  this->unlocked = false;
  this->resourceIsSelected = false;
  this->selectedResourceId = 0;
  this->returnToListAfterAction = false;
  this->pendingUiAction.clear();
  this->api.cancelResourceAction();
  this->waitingForResourceRefresh = false;
  this->actionCompletionMessage.clear();
  Display::resourceDetailsScreen.hideActionProgress();
  this->currentProjectsUser.clear();
  this->cardAuthenticationData = {};
  this->clearProjectSelection();
  this->resetPauseAccounting();
  Display::resourceListScreen.setAuthenticatedUser("");
  Display::resourceListScreen.hideActionProgress();
  this->nfc.enableCardDetection();
}

void Application::finishCardAuthentication(bool success) {
  this->cardAuthenticationPending = false;
  Display::resourceListScreen.hideActionProgress();
  Display::lockscreen.hideActionProgress();
  if (success) {
    this->restartSessionTimeout();
    this->selectedResourceChanged = true;
  } else {
    this->externalState = EXTERNAL_STATE_NONE;
    this->state = APPLICATION_STATE_INIT;
    this->nfc.enableCardDetection();
  }
}
void Application::pollUsageStats() {
  const API::ResourceBrief *resource = nullptr;
  if (this->unlocked && this->resourceIsSelected && this->state == APPLICATION_STATE_UNLOCKED &&
      this->cardAuthenticationData.username == this->resourceList.authenticatedUsername) {
    for (uint16_t i = 0; i < this->resourceList.count; ++i)
      if (this->resourceList.items[i].id == this->selectedResourceId) resource = &this->resourceList.items[i];
  }
  if (!resource || !resource->hasActiveUsage || !resource->activeUsageId ||
      this->cardAuthenticationData.username != resource->activeUser) {
    this->usageStatsResourceId = 0;
    this->usageStatsUsageId = 0;
    return;
  }
  const uint32_t now = millis();
  if (this->usageStatsResourceId != resource->id || this->usageStatsUsageId != resource->activeUsageId ||
      now - this->usageStatsRequestedAt >= 10000) {
    this->usageStatsResourceId = resource->id;
    this->usageStatsUsageId = resource->activeUsageId;
    this->usageStatsRequestedAt = now;
    this->api.requestUsageStats(resource->id);
  }
}

#endif
