// Session coordination: resource/project selection, action buttons, pause timing
// FEATURE: application-session

#include "application.hpp"
#include "platform.hpp"
#include <cstdlib>
#include <cstring>
#include <string>

#ifdef HAS_LVGL_DISPLAY
void Application::handleConnectionConfigurationSave(
    const ConnectionConfigurationScreen::ConnectionConfig &cfg) {
  // split cfg.host into hostname and port (if no port present, use 443)
  std::string host = cfg.host;
  std::string hostname = host;
  std::string port = "443";
  size_t colonPos = host.find(":");
  if (colonPos != std::string::npos) {
    hostname = host.substr(0, colonPos);
    port = host.substr(colonPos + 1);
  }
  Settings::saveNetworkConfig(std::string(cfg.ssid.c_str()),
                              std::string(cfg.password.c_str()));
  Settings::saveAttraccessApiConfig(
      hostname, (uint16_t)strtol(port.c_str(), nullptr, 10), cfg.useSSL);

    Settings::setDevicePin(std::string(cfg.devicePin.c_str()));
    Settings::setBeeperEnabled(cfg.beeperEnabled);

    this->state = APPLICATION_STATE_INIT;
    this->api.enableConnectionAttempts();
    Display::transitionToScreen(&Display::initScreen);
};

void Application::handleResourceListUpdate(
    const API::ResourceList &resourceList) {
  this->logger.infof("Resource list updated: %d resources", resourceList.count);

  this->resourceList = resourceList;
  this->resourceCount = resourceList.count;
  this->resourceListUpdated = true;

  // If a resource is already selected, try to find it in the new list and
  // refresh the details screen.
  if (this->resourceIsSelected) {
    this->logger.info(
        "Resource is selected, trying to find it in the new list");
    for (uint16_t i = 0; i < this->resourceList.count; ++i) {
      const auto &obj = this->resourceList.items[i];
      if (obj.id == this->selectedResourceId) {
        this->logger.infof(
            "Resource found in the new list, refreshing the details screen: %s",
            obj.name);
        this->selectResource(obj);
        break;
      }
    }
  }
}

void Application::selectResource(const API::ResourceBrief &resource) {
  this->logger.infof("Opening resource details: %s", resource.name);
  this->resourceIsSelected = true;
  this->selectedResourceId = resource.id;
  this->restartResourceSelectionTimeout();
  this->selectedResourceChanged = true;
  this->state = APPLICATION_STATE_UNLOCKED;
  this->restartSessionTimeout();
  Display::resourceDetailsScreen.setResourceAndUsageDetails(resource);
  Display::transitionToScreen(&Display::resourceDetailsScreen);
}

void Application::handleResourceListAction(const API::ResourceBrief &resource) {
  if (!this->unlocked || this->actionInProgressCount > 0) {
    return;
  }

  // A list action operates on the row that was tapped, not a pre-selected resource.
  this->selectedResourceId = resource.id;
  this->resourceIsSelected = false;
  Display::resourceDetailsScreen.setResourceAndUsageDetails(resource);
  this->pendingActionResourceId = resource.id;
  this->pendingActionProjectId = 0;
  this->hasPendingFormRequest = false;
  this->formFlowSubmitted = false;
  if (resource.hasActiveUsage) {
    this->beginActionPause();
    this->logger.infof("Stopping resource from list: %s", resource.name);
    this->pendingActionType = PENDING_ACTION_STOP_SESSION;
    this->api.stopResourceUsageSession(resource.id);
    return;
  }

  if (this->cardAuthenticationData.requiresSupervisor) {
    this->supervision.beginReaderInitiated(this->cardAuthenticationData.username,
                                           resource.id);
    this->state = APPLICATION_STATE_SUPERVISION;
    this->externalState = EXTERNAL_STATE_NONE;
    return;
  }

  this->beginActionPause();
  this->logger.infof("Starting resource from list: %s", resource.name);
  this->pendingActionType = PENDING_ACTION_START_SESSION;
  this->api.startResourceUsageSession(resource.id);
}

void Application::requestProjectsPage(uint32_t page) {
  if (page == 0) {
    page = 1;
  }
  this->api.requestProjectsOfUser(page);
}

void Application::clearProjectSelection() {
  this->selectedProjectId = 0;
  this->selectedProjectName = "";
  this->projectsCurrentPage = 1;
  this->projectsTotalCount = 0;
  this->projectsHasMore = false;
  this->projectsOfUserResponse.count = 0;
  this->projectsOfUserResponse.page = 1;
  this->projectsOfUserResponse.total = 0;
  this->projectsOfUserResponse.limit = API::MAX_PROJECTS_PER_PAGE;
  this->projectsOfUserResponse.hasMore = false;
  this->projectsOfUserResponseUpdated = true;
  // Reached from the websocket task (card auth response) as well as from LVGL
  // event callbacks; rendering runs on its own task now, so guard the LVGL
  // mutation explicitly (lv_lock is recursive).
  lv_lock();
  Display::resourceDetailsScreen.setSelectedProject(0, nullptr);
  lv_unlock();
}

void Application::handleProjectSelection(uint32_t projectId,
                                         const std::string &projectName) {
  this->selectedProjectId = projectId;
  this->selectedProjectName = projectName;
  Display::resourceDetailsScreen.setSelectedProject(projectId,
                                                    projectName.c_str());
}

void Application::handleTouch(int16_t x, int16_t y) {
  if (this->state == APPLICATION_STATE_UNLOCKED) {
    this->restartSessionTimeout();
  }
}

void Application::restartSessionTimeout() {
  uint32_t now = millis();
  Display::resourceDetailsScreen.setSessionTimeoutTime(
      now + this->UNLOCKED_TIMEOUT_MS);
  this->timeOfUnlockedMs = now;
  this->resetPauseAccounting();
}

void Application::handleResourceDetailsButtonClick(
    ResourceDetailsScreen::ButtonClickEventData evt) {
  this->logger.infof("Resource details button clicked: %d",
                     evt.buttonClickType);

  if (this->state != APPLICATION_STATE_UNLOCKED) {
    return;
  }

  switch (evt.buttonClickType) {
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_START_SESSION: {
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

    if (this->cardAuthenticationData.requiresSupervisor && !isTakeover) {
      this->supervision.beginReaderInitiated(this->cardAuthenticationData.username,
                                             this->selectedResourceId);
      this->state = APPLICATION_STATE_SUPERVISION;
      this->externalState = EXTERNAL_STATE_NONE;
      break;
    }

    Display::resourceDetailsScreen.showActionProgress(
        isTakeover ? "Uebernehme Sitzung" : "Starte Sitzung");
    this->beginActionPause();
    this->pendingActionType = PENDING_ACTION_START_SESSION;
    this->pendingActionResourceId = this->selectedResourceId;
    this->pendingActionProjectId = isTakeover ? 0 : this->selectedProjectId;
    this->hasPendingFormRequest = false;
    this->formFlowSubmitted = false;
    this->api.startResourceUsageSession(this->selectedResourceId,
                                        isTakeover ? 0 : this->selectedProjectId,
                                        isTakeover);
    break;
  }
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_STOP_SESSION:
    Display::resourceDetailsScreen.showActionProgress("Beende Sitzung");
    this->beginActionPause();
    this->pendingActionType = PENDING_ACTION_STOP_SESSION;
    this->pendingActionResourceId = this->selectedResourceId;
    this->pendingActionProjectId = 0;
    this->hasPendingFormRequest = false;
    this->formFlowSubmitted = false;
    this->api.stopResourceUsageSession(this->selectedResourceId);
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_LOCK_DOOR:
    Display::resourceDetailsScreen.showActionProgress("Sperre Tuer");
    this->beginActionPause();
    this->api.lockDoor(this->selectedResourceId);
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_UNLOCK_DOOR:
    Display::resourceDetailsScreen.showActionProgress("Entsperre Tuer");
    this->beginActionPause();
    this->api.unlockDoor(this->selectedResourceId);
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_UNLATCH_DOOR:
    Display::resourceDetailsScreen.showActionProgress("Oeffne Tuer-Riegel");
    this->beginActionPause();
    this->api.unlatchDoor(this->selectedResourceId);
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_FLOW_BUTTON:
    Display::resourceDetailsScreen.showActionProgress("Aktion Ausfuehren");
    this->beginActionPause();
    this->api.triggerFlowButton(this->selectedResourceId, evt.flowButtonId);
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_LOGOUT:
    this->resourceIsSelected = false;
    this->unlocked = false;
    this->selectedResourceId = 0;
    this->currentProjectsUser = "";
    this->clearProjectSelection();
    this->pendingActionType = PENDING_ACTION_NONE;
    this->hasPendingFormRequest = false;
    this->formFlowSubmitted = false;
    Display::resourceDetailsScreen.hideFormsModal();
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
  }
}

void Application::endActionPause() {
  if (this->actionInProgressCount == 0) {
    return;
  }
  this->actionInProgressCount--;
  if (this->actionInProgressCount == 0) {
    uint32_t now = millis();
    uint32_t delta =
        (now >= this->pauseStartMs) ? (now - this->pauseStartMs) : 0;
    this->accumulatedPauseMs += delta;
    // Extend the UI deadline by the same delta and unfreeze
    Display::resourceDetailsScreen.extendSessionTimeoutBy(delta);
    Display::resourceDetailsScreen.setSessionTimeoutPaused(false);
  }
}

void Application::resetPauseAccounting() {
  this->pauseStartMs = 0;
  this->accumulatedPauseMs = 0;
  this->actionInProgressCount = 0;
  // Ensure not paused visually
  Display::resourceDetailsScreen.setSessionTimeoutPaused(false);
}

void Application::resetSessionOnDisconnect() {
  bool sessionActive = this->unlocked || this->resourceIsSelected ||
                       this->pendingActionType != PENDING_ACTION_NONE ||
                       this->hasPendingFormRequest ||
                       this->pendingFormRequestReady ||
                       this->currentProjectsUser.length() > 0;

  if (!sessionActive) {
    return;
  }

  this->logger.info("Connectivity lost; resetting session state");

  // Ensure any in-progress UI overlays are dismissed
  Display::resourceDetailsScreen.hideActionProgress();
  Display::resourceDetailsScreen.hideFormsModal();
  this->resetPauseAccounting();

  this->pendingActionType = PENDING_ACTION_NONE;
  this->pendingActionResourceId = 0;
  this->pendingActionProjectId = 0;
  this->hasPendingFormRequest = false;
  this->pendingFormRequestReady = false;
  this->pendingFormFieldsReady = false;
  this->pendingFormPageResultReady = false;
  this->formCursorFormIdx = 0;
  this->formCursorOffset = 0;

  this->clearProjectSelection();
  this->currentProjectsUser = "";

  this->selectedResourceId = 0;
  this->resourceIsSelected = false;
  this->selectedResourceChanged = false;

  this->unlocked = false;
  this->externalState = EXTERNAL_STATE_NONE;
  this->nfc.enableCardDetection();
}
#endif
