// Session coordination: resource/project selection, action buttons, pause timing
// FEATURE: application-session

#include "application.hpp"
#include "platform.hpp"
#include <cstdlib>
#include <cstring>
#include <string>

#ifdef HAS_LVGL_DISPLAY
void Application::handleResourceDetailsButtonClick(
    ResourceDetailsScreen::ButtonClickEventData evt) {
  this->logger.infof("Resource details button clicked: %d",
                     evt.buttonClickType);

  if (!this->unlocked || !this->pendingUiAction.empty() || this->waitingForResourceRefresh) {
    return;
  }

  if (evt.buttonClickType != ResourceDetailsScreen::BUTTON_CLICK_TYPE_BACK &&
      evt.buttonClickType != ResourceDetailsScreen::BUTTON_CLICK_TYPE_LOGOUT) {
    this->pendingUiResourceId = this->selectedResourceId;
    this->pendingUiStartedAt = millis();
  }
  switch (evt.buttonClickType) {
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_START_SESSION: {
    this->pendingUiAction = "START_RESOURCE_USAGE_SESSION";
    // Detect takeover: another user has an active session and the resource allows it
    bool isTakeover = false;
    for (uint16_t i = 0; i < this->resourceList.count; ++i) {
      if (this->resourceList.items[i].id == this->selectedResourceId) {
        const auto &res = this->resourceList.items[i];
        isTakeover = res.hasActiveUsage && res.allowTakeOver &&
                     strcmp(res.activeUser,
                            this->cardAuthenticationData.username.c_str()) != 0;
        break;
      }
    }

    // Resource-first authentication can finish before its personalized list.
    // Match the same verified-card fallback used by the details screen.
    bool requiresSupervisor = this->authenticationResourceId == this->selectedResourceId &&
                              this->cardAuthenticationData.requiresSupervisor;
    for (uint16_t i = 0; i < this->resourceList.count; ++i)
      if (this->resourceList.items[i].id == this->selectedResourceId && this->resourceList.items[i].accessKnown &&
          this->cardAuthenticationData.username == this->resourceList.authenticatedUsername)
        requiresSupervisor = this->resourceList.items[i].requiresSupervisor;
    if (requiresSupervisor && !isTakeover) {
      this->beginActionPause();
      this->supervision.beginReaderInitiated(this->cardAuthenticationData.username,
                                             this->selectedResourceId);
      this->state = APPLICATION_STATE_SUPERVISION;
      this->externalState = EXTERNAL_STATE_NONE;
      break;
    }

    this->showReaderActionProgress(
        isTakeover ? "Übernehme Sitzung" : "Starte Sitzung");
    this->beginActionPause();
    this->pendingActionType = PENDING_ACTION_START_SESSION;
    this->pendingActionResourceId = this->selectedResourceId;
    this->pendingActionProjectId = isTakeover ? 0 : this->selectedProjectId;
    this->pendingActionIsTakeover = isTakeover;
    this->hasPendingFormRequest = false;
    this->formFlowSubmitted = false;
    this->api.startResourceUsageSession(this->selectedResourceId,
                                        isTakeover ? 0 : this->selectedProjectId,
                                        isTakeover);
    break;
  }
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_STOP_SESSION:
    this->pendingUiAction = "STOP_RESOURCE_USAGE_SESSION";
    this->showReaderActionProgress("Nutzung wird beendet");
    this->beginActionPause();
    this->pendingActionType = PENDING_ACTION_STOP_SESSION;
    this->pendingActionResourceId = this->selectedResourceId;
    this->pendingActionProjectId = 0;
    this->pendingActionIsTakeover = false;
    this->hasPendingFormRequest = false;
    this->formFlowSubmitted = false;
    this->api.stopResourceUsageSession(this->selectedResourceId);
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_LOCK_DOOR:
    this->pendingUiAction = "LOCK_DOOR";
    this->showReaderActionProgress("Sperre Tür");
    this->beginActionPause();
    this->api.lockDoor(this->selectedResourceId);
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_UNLOCK_DOOR:
    this->pendingUiAction = "UNLOCK_DOOR";
    this->showReaderActionProgress("Entsperre Tür");
    this->beginActionPause();
    this->api.unlockDoor(this->selectedResourceId);
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_UNLATCH_DOOR:
    this->pendingUiAction = "UNLATCH_DOOR";
    this->showReaderActionProgress("Öffne Tür-Riegel");
    this->beginActionPause();
    this->api.unlatchDoor(this->selectedResourceId);
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_FLOW_BUTTON:
    this->pendingUiAction = "TRIGGER_FLOW_BUTTON";
    this->showReaderActionProgress("Aktion Ausführen");
    this->beginActionPause();
    this->api.triggerFlowButton(this->selectedResourceId, evt.flowButtonId);
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_LOGOUT:
    this->logoutReader();
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_BACK:
    this->resourceIsSelected = false;
    this->selectedResourceId = 0;
    this->returnToListAfterAction = false;
    this->clearSelectedProject();
    break;
  }
}

void Application::restartResourceSelectionTimeout() {
  uint32_t now = millis();
  this->timeOfResourceSelectionMs = now;
}

void Application::beginActionPause() {
  this->actionInProgressCount++;
  if (this->actionInProgressCount == 1) {
    this->pauseStartMs = millis();
    // Freeze the UI indicator
    Display::resourceDetailsScreen.setSessionTimeoutPaused(true);
    Display::resourceListScreen.setSessionTimeoutPaused(true);
  }
}

void Application::endActionPause() {
  if (this->actionInProgressCount == 0) {
    return;
  }
  this->actionInProgressCount--;
  if (this->actionInProgressCount == 0) {
    uint32_t now = millis();
    uint32_t delta = now - this->pauseStartMs;
    this->accumulatedPauseMs += delta;
    // Extend the UI deadline by the same delta and unfreeze
    Display::resourceDetailsScreen.extendSessionTimeoutBy(delta);
    Display::resourceListScreen.extendSessionTimeoutBy(delta);
    Display::resourceDetailsScreen.setSessionTimeoutPaused(false);
  Display::resourceListScreen.setSessionTimeoutPaused(false);
  }
}

#endif
