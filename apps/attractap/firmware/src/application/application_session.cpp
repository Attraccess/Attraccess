#include "../state/state.hpp"
// Session coordination: resource/project selection, action buttons, pause timing
// FEATURE: application-session

#include "application.hpp"
#include "../platform.hpp"
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
    if (!this->actionCompletionMessage.empty() && !this->billingSummaryShown) {
      // Back on the list when the action was started there; routing does that once the screen is done.
      this->showStatus(StatusScreen::success(this->actionCompletionMessage,
                                             FirmwareI18n::Text::literal(this->completedResourceName) /* i18n-data: Server-supplied resource name; preserve exact contents. */),
                       this->returnToListAfterAction);
    }
    this->billingSummaryShown = false;
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

bool Application::requestProjectsPage(uint32_t page, const std::string &search) {
  if (page == 0) {
    page = 1;
  }
  return this->api.requestProjectsOfUser(page, search);
}

void Application::clearProjectSelection() {
  this->clearSelectedProject();
  lv_lock();
  Display::projectSelectScreen.resetProjectsSearch();
  lv_unlock();
  this->projectsCurrentPage = 1;
  this->projectsTotalCount = 0;
  this->projectsHasMore = false;
  this->projectsOfUserResponse.count = 0;
  this->projectsOfUserResponse.page = 1;
  this->projectsOfUserResponse.total = 0;
  this->projectsOfUserResponse.limit = API::MAX_PROJECTS_PER_PAGE;
  this->projectsOfUserResponse.hasMore = false;
  this->projectsOfUserResponse.search.clear();
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
  if (this->sessionSummaryActive) {
    if (this->sessionSummaryVisible && Display::touchPressSequence != this->sessionSummaryTouchSequence)
      this->sessionSummaryDismissRequested = true;
    return;
  }
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

#endif

// Session coordination: resource/project selection, action buttons, pause timing
// FEATURE: application-session

#ifdef HAS_LVGL_DISPLAY
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

  this->sessionSummaryActive = false;
  this->sessionSummaryVisible = false;
  this->sessionSummaryDismissRequested = false;
  Display::sessionSummaryScreen.clearSummary();
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
  Display::formsScreen.resetForm();
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
  State::setUserLanguage(false);
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

void Application::showReaderActionProgress(const FirmwareI18n::Text &title) {
  if (this->returnToListAfterAction && !this->resourceIsSelected) {
    const char *name = "";
    for (uint16_t i = 0; i < this->resourceList.count; ++i)
      if (this->resourceList.items[i].id == this->pendingUiResourceId) name = this->resourceList.items[i].name;
    Display::resourceListScreen.showActionProgress(title, FirmwareI18n::Text::literal(name));
  } else Display::resourceDetailsScreen.showActionProgress(title);
}


#endif

// Session coordination: resource/project selection, action buttons, pause timing
// FEATURE: application-session

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
        isTakeover ? FirmwareI18n::Message::TakingOverSession : FirmwareI18n::Message::StartingSession);
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
    this->showReaderActionProgress(FirmwareI18n::Message::EndingUsage);
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
    this->showReaderActionProgress(FirmwareI18n::Message::LockingDoor);
    this->beginActionPause();
    this->api.lockDoor(this->selectedResourceId);
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_UNLOCK_DOOR:
    this->pendingUiAction = "UNLOCK_DOOR";
    this->showReaderActionProgress(FirmwareI18n::Message::UnlockingDoor);
    this->beginActionPause();
    this->api.unlockDoor(this->selectedResourceId);
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_UNLATCH_DOOR:
    this->pendingUiAction = "UNLATCH_DOOR";
    this->showReaderActionProgress(FirmwareI18n::Message::ReleasingDoorLatch);
    this->beginActionPause();
    this->api.unlatchDoor(this->selectedResourceId);
    break;
  case ResourceDetailsScreen::BUTTON_CLICK_TYPE_FLOW_BUTTON:
    this->pendingUiAction = "TRIGGER_FLOW_BUTTON";
    this->showReaderActionProgress(FirmwareI18n::Message::RunningAction);
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


uint32_t Application::routingKey() const {
  return (static_cast<uint32_t>(this->state) << 24) ^ (this->unlocked ? (1u << 23) : 0u) ^
         (this->resourceIsSelected ? (1u << 22) : 0u) ^ (this->selectedResourceId & 0x3FFFFFu);
}

void Application::showStatus(StatusScreen::Config config, bool resumeRouting) {
  config.onDismiss = [this, resumeRouting] {
    this->statusHeld = false;
    if (resumeRouting || !Display::returnFromTransient()) this->state = APPLICATION_STATE_INIT;
  };
  this->statusHeld = true;
  this->statusHoldKey = this->routingKey();
  Display::showStatus(std::move(config));
}

std::string Application::resourceNameOf(uint32_t resourceId) const {
  for (uint16_t i = 0; i < this->resourceList.count; ++i)
    if (this->resourceList.items[i].id == resourceId) return this->resourceList.items[i].name;
  return std::string();
}

void Application::showActionFailure(uint32_t resourceId, const std::string &errorCode, const FirmwareI18n::Text &preferred) {
  // The raw server error is for the log; the screen only shows text the reader can localize.
  this->logger.errorf("Action failed: %s", errorCode.c_str());
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

void Application::handleReaderError(const std::string &eventType, const std::string &code) {
  const FirmwareI18n::Text known = FirmwareI18n::knownReaderError(code);
  const FirmwareI18n::Text retry = known.empty() ? FirmwareI18n::Text(FirmwareI18n::Message::ActionFailedTapToRetry) : known;
  if (eventType == "CARD_AUTHENTICATION_DATA") {
    this->beeper.errorBeep();
    if (this->cardAuthenticationPending) this->finishCardAuthentication(false);
    this->nfc.enableCardDetection();
    this->showStatus(StatusScreen::error(FirmwareI18n::Message::SignInFailed, FirmwareI18n::readerError(code)));
  } else if (eventType == "RESOURCE_USAGE_FORM_PAGE_RESULT") {
    // The server could not take the page: stay on the form, in place on Next/Submit.
    if (Display::isActive(&Display::formsScreen)) {
      this->beeper.errorBeep();
      Display::formsScreen.showSubmitError(retry);
    }
  } else if (eventType == "RESOURCE_USAGE_FORM_REQUEST" || eventType == "RESOURCE_USAGE_FORM_FIELDS") {
    // The form never opened (or broke): back to the button that started the action.
    this->beeper.errorBeep();
    const uint32_t resourceId = this->pendingUiResourceId;
    this->finishReaderAction(false);
    this->handleFormsCancel();
    this->showActionFailure(resourceId, code);
  } else if (eventType == "BILLING_TOPUP") {
    // The top-up request was refused: back to the amount, with the reason on "Top up".
    if (this->unlocked) {
      this->beeper.errorBeep();
      this->openTopUp();
      Display::topUpScreen.showError(retry);
    }
  } else if (eventType == "PROJECTS_OF_USER") {
    Display::projectSelectScreen.showLoadError();
  } else if (eventType.rfind("ENROLL_NEW_CARD", 0) == 0) {
    if (Display::isActive(&Display::enrollmentScreen)) {
      Display::enrollmentScreen.setStatus(EnrollmentScreen::STATUS_ERROR);
      Display::enrollmentScreen.setStatusMessage(FirmwareI18n::readerError(code));
    }
  } else if (eventType == "RESET_NFC_CARD") {
    if (Display::isActive(&Display::resetScreen)) {
      Display::resetScreen.setStatus(ResetScreen::STATUS_ERROR);
      Display::resetScreen.setStatusMessage(FirmwareI18n::readerError(code));
    }
  }
  // Anything else is background traffic (resource list refreshes, language, firmware notices):
  // the API has logged it, and nobody is waiting on it.
}

void Application::openTopUp() {
  // A late balance error for a session that already ended has nobody to top up.
  if (!this->unlocked || this->state == APPLICATION_STATE_TOP_UP) return;
  Display::topUpScreen.reset();
  Display::topUpScreen.setCallbacks(
      [this](uint32_t amountCents) {
        if (this->state != APPLICATION_STATE_TOP_UP || !this->unlocked) return;
        this->leaveTopUp();
        this->api.requestBillingTopup(amountCents);
        this->showStatus(StatusScreen::warning(FirmwareI18n::Message::PleaseContinueAtThePaymentTerminal, FirmwareI18n::Text(), false));
      },
      [this]() { this->leaveTopUp(); });
  this->state = APPLICATION_STATE_TOP_UP;
  Display::transitionToScreen(&Display::topUpScreen);
}

void Application::leaveTopUp() {
  if (this->state != APPLICATION_STATE_TOP_UP) return;
  if (this->resourceIsSelected) {
    this->state = APPLICATION_STATE_UNLOCKED;
    Display::transitionToScreen(&Display::resourceDetailsScreen);
  } else {
    this->state = APPLICATION_STATE_RESOURCE_LIST_AUTHENTICATED;
    Display::resourceListScreen.setAuthenticatedUser(this->cardAuthenticationData.username);
    Display::transitionToScreen(&Display::resourceListScreen);
  }
}

// Back from the form screen to the details it was raised over. When the action was started from
// the list the selection is already cleared and routing takes the reader back to the list.
void Application::leaveForms() {
  Display::formsScreen.resetForm();
  if (Display::isActive(&Display::formsScreen) && this->resourceIsSelected) Display::returnFromTransient();
}

void Application::openProjects() {
  Display::projectSelectScreen.setSelectedProject(this->selectedProjectId);
  Display::projectSelectScreen.begin();
  Display::transitionToScreen(&Display::projectSelectScreen);
}

#endif
