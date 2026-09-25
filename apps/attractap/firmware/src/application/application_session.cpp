// Session coordination: resource/project selection, action buttons, pause timing
// FEATURE: application-session

#include "application.hpp"
#include "../state/state.hpp"
#include "platform.hpp"
#include <cstdlib>
#include <cstring>
#include <string>

#ifdef HAS_LVGL_DISPLAY
void Application::handleConnectionConfigurationSave(
    const ConnectionConfigurationScreen::ConnectionConfig &cfg) {
  // The desktop host accepts a full URL while the embedded screen stores host,
  // port, and TLS separately. Normalize either form before persisting it.
  std::string host = cfg.host;
  bool useSSL = cfg.useSSL;
  if (host.rfind("http://", 0) == 0) {
    host.erase(0, 7);
    useSSL = false;
  } else if (host.rfind("https://", 0) == 0) {
    host.erase(0, 8);
    useSSL = true;
  }
  const size_t pathPos = host.find_first_of("/?#");
  if (pathPos != std::string::npos) host.erase(pathPos);
  std::string hostname = host;
  std::string port = useSSL ? "443" : "80";
  size_t colonPos = host.find(":");
  if (colonPos != std::string::npos) {
    hostname = host.substr(0, colonPos);
    port = host.substr(colonPos + 1);
  }
  Settings::saveNetworkConfig(std::string(cfg.ssid.c_str()),
                              std::string(cfg.password.c_str()));
  Settings::saveAttraccessApiConfig(
      hostname, (uint16_t)strtol(port.c_str(), nullptr, 10), useSSL);

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
  if (this->waitingForResourceRefresh && resourceList.requestId == this->resourceRefreshRequestId &&
      this->cardAuthenticationData.username == resourceList.authenticatedUsername) {
    this->waitingForResourceRefresh = false;
    this->endActionPause();
    Display::resourceListScreen.hideActionProgress();
    Display::resourceDetailsScreen.hideActionProgress();
    if (!this->actionCompletionMessage.empty()) {
      if (this->returnToListAfterAction) Display::resourceListScreen.showSuccessToast(this->actionCompletionMessage.c_str());
      else Display::resourceDetailsScreen.showSuccessToast(this->actionCompletionMessage.c_str());
    }
    this->returnToListAfterAction = false;
    this->actionCompletionMessage.clear();
  }

  // Permissions belong to the resource, not the resource used to authenticate.
  if (this->selectedResourceId != 0) this->selectedResourceChanged = true;

}

void Application::selectResource(const API::ResourceBrief &resource) {
  this->logger.infof("Resource selected: %s", resource.name);
  this->resourceIsSelected = true;
  this->selectedResourceId = resource.id;
  this->restartResourceSelectionTimeout();
  this->selectedResourceChanged = true;
}

void Application::requestProjectsPage(uint32_t page) {
  if (page == 0) {
    page = 1;
  }
  this->api.requestProjectsOfUser(page);
}

void Application::clearProjectSelection() {
  this->clearSelectedProject();
  this->projectsCurrentPage = 1;
  this->projectsTotalCount = 0;
  this->projectsHasMore = false;
  this->projectsOfUserResponse.count = 0;
  this->projectsOfUserResponse.page = 1;
  this->projectsOfUserResponse.total = 0;
  this->projectsOfUserResponse.limit = API::MAX_PROJECTS_PER_PAGE;
  this->projectsOfUserResponse.hasMore = false;
  this->projectsOfUserResponseUpdated = true;
 }

void Application::clearSelectedProject() {
  this->selectedProjectId = 0;
  this->selectedProjectName.clear();
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
  if (this->unlocked && this->actionInProgressCount == 0 && this->pendingUiAction.empty() && !this->waitingForResourceRefresh) {
    this->restartSessionTimeout();
  }
}

void Application::restartSessionTimeout() {
  uint32_t now = millis();
  Display::resourceDetailsScreen.setSessionTimeoutTime(now + this->UNLOCKED_TIMEOUT_MS);
  Display::resourceListScreen.setSessionTimeoutTime(now + this->UNLOCKED_TIMEOUT_MS);
  this->timeOfUnlockedMs = now;
  this->resetPauseAccounting();
}

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

void Application::resetPauseAccounting() {
  this->pauseStartMs = 0;
  this->accumulatedPauseMs = 0;
  this->actionInProgressCount = 0;
  // Ensure not paused visually
  Display::resourceDetailsScreen.setSessionTimeoutPaused(false);
  Display::resourceListScreen.setSessionTimeoutPaused(false);
}

void Application::resetSessionOnDisconnect() {
  bool sessionActive = this->unlocked || this->resourceIsSelected || this->cardAuthenticationPending ||
                       this->pendingActionType != PENDING_ACTION_NONE ||
                       this->hasPendingFormRequest ||
                       this->hasPendingServerFormFlow ||
                       this->currentProjectsUser.length() > 0;

  if (!sessionActive) {
    return;
  }

  this->logger.info("Connectivity lost; resetting session state");

  // Ensure any in-progress UI overlays are dismissed
  Display::resourceDetailsScreen.hideActionProgress();
  Display::resourceListScreen.hideActionProgress();
  Display::resourceListScreen.setAuthenticatedUser("");
  Display::lockscreen.hideActionProgress();
  this->cardAuthenticationPending = false;
  this->api.cancelResourceAction();
  this->pendingUiAction.clear();
  this->returnToListAfterAction = false;
  this->waitingForResourceRefresh = false;
  this->actionCompletionMessage.clear();
  Display::resourceDetailsScreen.hideFormsModal();
  this->resetPauseAccounting();

  this->pendingActionType = PENDING_ACTION_NONE;
  this->pendingActionResourceId = 0;
  this->pendingActionProjectId = 0;
  this->pendingActionIsTakeover = false;
  this->hasPendingFormRequest = false;
  this->hasPendingServerFormFlow = false;
  this->pendingFormRequestResourceId = 0;
  this->pendingFormRequestAction = API::ResourceUsageFormActionType::UNKNOWN;
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

void Application::updateSelectedResourceDetails() {
  for (uint16_t i = 0; i < this->resourceList.count; ++i) {
    const auto &resource = this->resourceList.items[i];
    if (resource.id != this->selectedResourceId) continue;
    Display::lockscreen.setResourceName(resource.name);
    Display::lockscreen.setUsageInfo(resource.hasActiveUsage, resource.activeUser, resource.isUnderMaintenance);
    Display::resourceDetailsScreen.setResourceAndUsageDetails(resource);
    const bool personalized = resource.accessKnown && this->cardAuthenticationData.username == this->resourceList.authenticatedUsername;
    const bool legacy = !resource.accessKnown && this->authenticationResourceId == resource.id;
    Display::resourceDetailsScreen.setUserDetails({
      this->cardAuthenticationData.username,
      personalized ? resource.canManageResource : legacy && this->cardAuthenticationData.canManageResource,
      personalized ? resource.hasIntroduction : legacy && this->cardAuthenticationData.hasIntroduction,
      personalized ? resource.isIntroducer : legacy && this->cardAuthenticationData.isIntroducer,
      personalized ? resource.requiresSupervisor : legacy && this->cardAuthenticationData.requiresSupervisor});
    return;
  }
  // The selected resource was removed while the user was looking at it.
  if (this->pendingUiAction.empty()) { this->resourceIsSelected = false; this->selectedResourceId = 0; }
}

void Application::handleResourceListAction(const API::ResourceBrief &resource, ResourceListAction action) {
  if (!this->unlocked || !this->pendingUiAction.empty() || this->waitingForResourceRefresh || this->resourceIsSelected ||
      this->cardAuthenticationData.username != this->resourceList.authenticatedUsername) return;
  // Re-resolve against the latest application list, not a row's earlier snapshot.
  const API::ResourceBrief *current = nullptr;
  for (uint16_t i = 0; i < this->resourceList.count; ++i)
    if (this->resourceList.items[i].id == resource.id) current = &this->resourceList.items[i];
  if (!current || action != resourceListAction(*current, this->cardAuthenticationData.username)) return;
  this->selectResource(*current);
  this->updateSelectedResourceDetails();
  this->clearSelectedProject();
  if (action == ResourceListAction::Takeover) return;
  this->resourceIsSelected = false;
  this->returnToListAfterAction = true;
  auto type = ResourceDetailsScreen::BUTTON_CLICK_TYPE_START_SESSION;
  if (action == ResourceListAction::Stop) type = ResourceDetailsScreen::BUTTON_CLICK_TYPE_STOP_SESSION;
  if (action == ResourceListAction::OpenDoor)
    type = current->separateUnlockAndUnlatch ? ResourceDetailsScreen::BUTTON_CLICK_TYPE_UNLATCH_DOOR : ResourceDetailsScreen::BUTTON_CLICK_TYPE_UNLOCK_DOOR;
  this->handleResourceDetailsButtonClick({&Display::resourceDetailsScreen, type, {}});
}

void Application::showReaderActionProgress(const char *title) {
  if (this->returnToListAfterAction && !this->resourceIsSelected) {
    const char *name = "";
    for (uint16_t i = 0; i < this->resourceList.count; ++i)
      if (this->resourceList.items[i].id == this->pendingUiResourceId) name = this->resourceList.items[i].name;
    Display::resourceListScreen.showActionProgress(title, name);
  } else Display::resourceDetailsScreen.showActionProgress(title);
}

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
  State::setUserLanguage("");
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
    State::setUserLanguage("");
    this->externalState = EXTERNAL_STATE_NONE;
    this->state = APPLICATION_STATE_INIT;
    this->nfc.enableCardDetection();
  }
}
#endif
