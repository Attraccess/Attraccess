#include "../app_runtime.hpp"

namespace app::runtime {

#ifdef HAS_LVGL_DISPLAY
bool AppRuntime::handleDisplayResourceAndSessionFlow() {
  ResourceController::ResourceAvailabilityDecision resourceDecision =
      resourceController_.evaluateResourceAvailability(
          state_.resourceCount, state_.resourceIsSelected,
          state_.resourceListUpdated,
          state_.state == AppRuntimeState::APPLICATION_STATE_NO_RESOURCES,
          state_.state == AppRuntimeState::APPLICATION_STATE_RESOURCE_LIST);
  if (resourceDecision.shouldShowNoResources) {
    logger_.debug("Resource count is 0, showing no resources screen");
    state_.state = AppRuntimeState::APPLICATION_STATE_NO_RESOURCES;
    ui_.transitionToNoResourcesScreen();
    return true;
  }
  if (resourceDecision.shouldAutoSelectSingleResource) {
    logger_.debug(
        "Resource count is 1 and resource is not selected, selecting resource");
    selectResource(state_.resourceList.items[0]);
    return true;
  }
  if (resourceDecision.shouldUpdateResourceListUi) {
    ui_.resourceListSetResourceList(state_.resourceList);
    state_.resourceListUpdated = false;
  }
  if (resourceDecision.shouldReturnEarly) {
    return true;
  }
  if (resourceDecision.shouldShowResourceList) {
    logger_.debug("Resource count is greater than 0 and resource is not "
                  "selected, showing resource list");
    state_.state = AppRuntimeState::APPLICATION_STATE_RESOURCE_LIST;
    ui_.transitionToResourceListScreen();
    return true;
  }

  if (state_.selectedResourceChanged) {
    for (uint16_t i = 0; i < state_.resourceList.count; ++i) {
      if (state_.resourceList.items[i].id == state_.selectedResourceId) {
        app::contracts::ResourceBrief resource = state_.resourceList.items[i];
        ui_.lockscreenSetResourceName(resource.name);
        ui_.lockscreenSetUsageInfo(resource.hasActiveUsage, resource.activeUser);
        ui_.resourceDetailsSetResourceAndUsageDetails(resource);
        break;
      }
    }
    state_.selectedResourceChanged = false;
  }

  uint32_t now = system_.nowMs();
  if (!state_.unlocked) {
    SessionController::LockedStateDecision lockedDecision =
        sessionController_.evaluateLockedState(
            state_.unlocked,
            state_.state == AppRuntimeState::APPLICATION_STATE_LOCKED, now,
            state_.timeOfResourceSelectionMs,
            state_.RESOURCE_SELECTION_TIMEOUT_MS);
    if (lockedDecision.shouldClearResourceSelection) {
      logger_.debug("Resource selection timeout reached, showing resource list");
      state_.resourceIsSelected = false;
    }
    if (lockedDecision.shouldReturnEarly) {
      return true;
    }
    if (lockedDecision.shouldTransitionToLocked) {
      logger_.debug("Card is not detected, showing lockscreen");
      state_.state = AppRuntimeState::APPLICATION_STATE_LOCKED;
      ui_.transitionToLockscreen([this]() {
        logger_.debug(
            "Lockscreen transition complete, enabling card detection");
        nfc_.enableCardDetection();
      });
    }
    return true;
  }

  if (state_.state == AppRuntimeState::APPLICATION_STATE_UNLOCKED) {
    SessionController::UnlockedStateDecision unlockedDecision =
        sessionController_.evaluateUnlockedState(
            state_.unlocked,
            state_.state == AppRuntimeState::APPLICATION_STATE_UNLOCKED, now,
            state_.timeOfUnlockedMs, state_.accumulatedPauseMs,
            state_.UNLOCKED_TIMEOUT_MS, state_.resourceCount);
    if (unlockedDecision.shouldRelock) {
      logger_.debug("Unlocked timeout reached, locking");
      state_.unlocked = false;
      state_.resourceIsSelected =
          unlockedDecision.keepResourceSelectedOnRelock;
    }
    if (state_.projectsOfUserResponseUpdated) {
      ui_.resourceDetailsSetProjects(state_.projectsOfUserResponse);
      ui_.resourceDetailsSetSelectedProject(
          state_.selectedProjectId, state_.selectedProjectName.c_str());
      state_.projectsOfUserResponseUpdated = false;
    }
    return true;
  }

  logger_.debug("Resource is unlocked, showing resource details screen");
  state_.state = AppRuntimeState::APPLICATION_STATE_UNLOCKED;
  restartSessionTimeout();
  ui_.transitionToResourceDetailsScreen();
  return true;
}

void AppRuntime::handleConnectionConfigurationSave(
    const app::contracts::ConnectionConfig &cfg) {
  String hostname = cfg.host;
  String port = "443";
  if (cfg.host.indexOf(":") != -1) {
    hostname = cfg.host.substring(0, cfg.host.indexOf(":"));
    port = cfg.host.substring(cfg.host.indexOf(":") + 1);
  }
  settings_.saveNetworkConfig(cfg.ssid, cfg.password);
  settings_.saveAttraccessApiConfig(hostname, port.toInt(), cfg.useSSL);
  settings_.setDevicePin(cfg.devicePin);
  settings_.setBeeperEnabled(cfg.beeperEnabled);
}

void AppRuntime::handleResourceListUpdate(
    const app::contracts::ResourceList &resourceList) {
  logger_.infof("Resource list updated: %d resources", resourceList.count);

  state_.resourceList = resourceList;
  state_.resourceCount = resourceList.count;
  state_.resourceListUpdated = true;

  if (state_.resourceIsSelected) {
    logger_.info("Resource is selected, trying to find it in the new list");
    for (uint16_t i = 0; i < state_.resourceList.count; ++i) {
      const auto &obj = state_.resourceList.items[i];
      if (obj.id == state_.selectedResourceId) {
        logger_.infof(
            "Resource found in the new list, refreshing the details screen: %s",
            obj.name);
        selectResource(obj);
        break;
      }
    }
  }
}

void AppRuntime::selectResource(const app::contracts::ResourceBrief &resource) {
  logger_.infof("Resource selected: %s", resource.name);
  state_.resourceIsSelected = true;
  state_.selectedResourceId = resource.id;
  restartResourceSelectionTimeout();
  state_.selectedResourceChanged = true;
}

void AppRuntime::requestProjectsPage(uint32_t page) {
  if (page == 0) {
    page = 1;
  }
  api_.requestProjectsOfUser(page);
}

void AppRuntime::clearProjectSelection() {
  state_.selectedProjectId = 0;
  state_.selectedProjectName = "";
  state_.projectsCurrentPage = 1;
  state_.projectsTotalCount = 0;
  state_.projectsHasMore = false;
  state_.projectsOfUserResponse.count = 0;
  state_.projectsOfUserResponse.page = 1;
  state_.projectsOfUserResponse.total = 0;
  state_.projectsOfUserResponse.limit = app::contracts::MAX_PROJECTS_PER_PAGE;
  state_.projectsOfUserResponse.hasMore = false;
  state_.projectsOfUserResponseUpdated = true;
  ui_.resourceDetailsSetSelectedProject(0, nullptr);
}

void AppRuntime::handleProjectSelection(uint32_t projectId,
                                        const String &projectName) {
  state_.selectedProjectId = projectId;
  state_.selectedProjectName = projectName;
  ui_.resourceDetailsSetSelectedProject(projectId, projectName.c_str());
}

void AppRuntime::handleFormsRequest(
    const app::contracts::ResourceUsageFormRequest &request) {
  (void)request;
  state_.hasPendingFormRequest = true;
  ui_.resourceDetailsHideActionProgress();
  ui_.resourceDetailsShowFormsModal(state_.pendingFormRequest);
}

void AppRuntime::handleFormsSubmit(
    const app::contracts::FormSubmissionList &submissions) {
  ResourceController::FormsSubmitDecision d =
      resourceController_.evaluateFormsSubmit(state_.pendingActionType);
  if (d.shouldCancelInstead) {
    handleFormsCancel();
    return;
  }

  if (d.shouldStoreSubmissionBuffer) {
    state_.formSubmissionBuffer = submissions;
    state_.hasPendingFormRequest = false;
  }
  if (d.shouldHideFormsModal) {
    ui_.resourceDetailsHideFormsModal();
  }
  if (d.shouldShowActionProgress && d.actionProgressMessage) {
    ui_.resourceDetailsShowActionProgress(d.actionProgressMessage);
  }

  if (d.shouldSendStartSession) {
    api_.startResourceUsageSession(state_.pendingActionResourceId,
                                   state_.pendingActionProjectId,
                                   &state_.formSubmissionBuffer);
  } else if (d.shouldSendStopSession) {
    api_.stopResourceUsageSession(state_.pendingActionResourceId,
                                  &state_.formSubmissionBuffer);
  }
}

void AppRuntime::handleFormsCancel() {
  ResourceController::FormsCancelDecision d =
      resourceController_.evaluateFormsCancel(state_.hasPendingFormRequest);
  if (d.shouldReturnEarly) {
    return;
  }
  if (d.shouldClearPendingFormRequest) {
    state_.hasPendingFormRequest = false;
  }
  if (d.shouldResetPendingAction) {
    state_.pendingActionType = AppRuntimeState::PENDING_ACTION_NONE;
  }
  if (d.shouldHideFormsModal) {
    ui_.resourceDetailsHideFormsModal();
  }
  if (d.shouldHideActionProgress) {
    ui_.resourceDetailsHideActionProgress();
  }
  if (d.shouldEndActionPause) {
    endActionPause();
  }
}

void AppRuntime::onActionResult(const String &eventType) {
  ResourceController::SessionActionResultDecision d =
      resourceController_.evaluateSessionActionResult(
          eventType == "START_RESOURCE_USAGE_SESSION" ||
          eventType == "STOP_RESOURCE_USAGE_SESSION");
  if (d.shouldResetPendingAction) {
    state_.pendingActionType = AppRuntimeState::PENDING_ACTION_NONE;
  }
  if (d.shouldClearPendingFormRequest) {
    state_.hasPendingFormRequest = false;
  }
  if (d.shouldHideFormsModal) {
    ui_.resourceDetailsHideFormsModal();
  }
}

void AppRuntime::handleTouch(int16_t x, int16_t y) {
  (void)x;
  (void)y;
  if (state_.state == AppRuntimeState::APPLICATION_STATE_UNLOCKED) {
    restartSessionTimeout();
  }
}

void AppRuntime::restartSessionTimeout() {
  uint32_t now = system_.nowMs();
  ui_.resourceDetailsSetSessionTimeoutTime(
      sessionController_.computeSessionTimeoutDeadlineMs(
          now, state_.UNLOCKED_TIMEOUT_MS));
  state_.timeOfUnlockedMs = now;
  resetPauseAccounting();
}

void AppRuntime::handleResourceDetailsButtonClick(
    app::contracts::ResourceDetailsButtonClickEventData evt) {
  logger_.infof("Resource details button clicked: %d", static_cast<int>(evt.type));

  ResourceController::ActionIntent intent =
      ResourceController::ACTION_INTENT_NONE;
  switch (evt.type) {
  case app::contracts::ResourceDetailsButtonClickType::START_SESSION:
    intent = ResourceController::ACTION_INTENT_START_SESSION;
    break;
  case app::contracts::ResourceDetailsButtonClickType::STOP_SESSION:
    intent = ResourceController::ACTION_INTENT_STOP_SESSION;
    break;
  case app::contracts::ResourceDetailsButtonClickType::LOCK_DOOR:
    intent = ResourceController::ACTION_INTENT_LOCK_DOOR;
    break;
  case app::contracts::ResourceDetailsButtonClickType::UNLOCK_DOOR:
    intent = ResourceController::ACTION_INTENT_UNLOCK_DOOR;
    break;
  case app::contracts::ResourceDetailsButtonClickType::UNLATCH_DOOR:
    intent = ResourceController::ACTION_INTENT_UNLATCH_DOOR;
    break;
  case app::contracts::ResourceDetailsButtonClickType::FLOW_BUTTON:
    intent = ResourceController::ACTION_INTENT_FLOW_BUTTON;
    break;
  case app::contracts::ResourceDetailsButtonClickType::LOGOUT:
    intent = ResourceController::ACTION_INTENT_LOGOUT;
    break;
  }

  ResourceController::ActionIntentDecision d =
      resourceController_.evaluateActionIntent(
          intent,
          state_.state == AppRuntimeState::APPLICATION_STATE_UNLOCKED,
          state_.resourceCount);
  if (d.shouldIgnore) {
    return;
  }

  if (d.shouldShowActionProgress && d.actionProgressMessage) {
    ui_.resourceDetailsShowActionProgress(d.actionProgressMessage);
  }
  if (d.shouldBeginActionPause) {
    beginActionPause();
  }
  if (d.shouldSetPendingAction) {
    state_.pendingActionType =
        (AppRuntimeState::pending_action_t)d.pendingActionType;
  }
  if (d.pendingActionType ==
      static_cast<int>(AppRuntimeState::PENDING_ACTION_START_SESSION)) {
    state_.pendingActionResourceId = state_.selectedResourceId;
    state_.pendingActionProjectId = state_.selectedProjectId;
  } else if (d.pendingActionType ==
             static_cast<int>(AppRuntimeState::PENDING_ACTION_STOP_SESSION)) {
    state_.pendingActionResourceId = state_.selectedResourceId;
    state_.pendingActionProjectId = 0;
  }
  if (d.shouldResetPendingFormRequest) {
    state_.hasPendingFormRequest = false;
  }
  if (d.shouldClearResourceSelection) {
    state_.resourceIsSelected = false;
  }
  if (d.shouldLock) {
    state_.unlocked = false;
  }
  if (d.shouldClearProjectsUser) {
    state_.currentProjectsUser = "";
  }
  if (d.shouldClearProjectSelection) {
    clearProjectSelection();
  }
  if (d.shouldHideFormsModal) {
    ui_.resourceDetailsHideFormsModal();
  }

  if (d.shouldApiStartSession) {
    api_.startResourceUsageSession(state_.selectedResourceId,
                                   state_.selectedProjectId);
  } else if (d.shouldApiStopSession) {
    api_.stopResourceUsageSession(state_.selectedResourceId);
  } else if (d.shouldApiLockDoor) {
    api_.lockDoor(state_.selectedResourceId);
  } else if (d.shouldApiUnlockDoor) {
    api_.unlockDoor(state_.selectedResourceId);
  } else if (d.shouldApiUnlatchDoor) {
    api_.unlatchDoor(state_.selectedResourceId);
  } else if (d.shouldApiTriggerFlowButton) {
    api_.triggerFlowButton(state_.selectedResourceId, evt.flowButtonId);
  }
}

void AppRuntime::restartResourceSelectionTimeout() {
  uint32_t now = system_.nowMs();
  state_.timeOfResourceSelectionMs = now;
}

void AppRuntime::beginActionPause() {
  state_.actionInProgressCount++;
  if (sessionController_.shouldPauseSessionTimeoutOnActionBegin(
          state_.actionInProgressCount)) {
    state_.pauseStartMs = system_.nowMs();
    ui_.resourceDetailsSetSessionTimeoutPaused(true);
  }
}

void AppRuntime::endActionPause() {
  if (sessionController_.shouldIgnoreActionPauseEnd(
          state_.actionInProgressCount)) {
    return;
  }
  state_.actionInProgressCount--;
  if (sessionController_.shouldApplyPauseDeltaOnActionEnd(
          state_.actionInProgressCount)) {
    uint32_t now = system_.nowMs();
    uint32_t delta =
        sessionController_.computePauseDeltaMs(now, state_.pauseStartMs);
    state_.accumulatedPauseMs += delta;
    ui_.resourceDetailsExtendSessionTimeoutBy(delta);
    ui_.resourceDetailsSetSessionTimeoutPaused(false);
  }
}

void AppRuntime::resetPauseAccounting() {
  sessionController_.resetPauseAccounting(
      state_.pauseStartMs, state_.accumulatedPauseMs,
      state_.actionInProgressCount);
  ui_.resourceDetailsSetSessionTimeoutPaused(false);
}

void AppRuntime::resetSessionOnDisconnect() {
  SessionController::DisconnectResetDecision disconnectResetDecision =
      sessionController_.evaluateDisconnectReset(
          state_.unlocked, state_.resourceIsSelected,
          state_.pendingActionType != AppRuntimeState::PENDING_ACTION_NONE,
          state_.hasPendingFormRequest, state_.pendingFormRequestReady,
          state_.currentProjectsUser.length() > 0);

  if (!disconnectResetDecision.shouldResetSession) {
    return;
  }

  logger_.info("Connectivity lost; resetting session state");

  if (disconnectResetDecision.shouldHideActionProgress) {
    ui_.resourceDetailsHideActionProgress();
  }
  if (disconnectResetDecision.shouldHideFormsModal) {
    ui_.resourceDetailsHideFormsModal();
  }
  if (disconnectResetDecision.shouldResetPauseAccounting) {
    resetPauseAccounting();
  }

  if (disconnectResetDecision.shouldResetPendingAction) {
    state_.pendingActionType = AppRuntimeState::PENDING_ACTION_NONE;
    state_.pendingActionResourceId = 0;
    state_.pendingActionProjectId = 0;
  }
  if (disconnectResetDecision.shouldClearPendingFormRequest) {
    state_.hasPendingFormRequest = false;
    state_.pendingFormRequestReady = false;
  }
  if (disconnectResetDecision.shouldClearProjectSelection) {
    clearProjectSelection();
  }
  if (disconnectResetDecision.shouldClearProjectsUser) {
    state_.currentProjectsUser = "";
  }
  if (disconnectResetDecision.shouldClearSelection) {
    state_.selectedResourceId = 0;
    state_.resourceIsSelected = false;
    state_.selectedResourceChanged = false;
  }
  if (disconnectResetDecision.shouldLock) {
    state_.unlocked = false;
  }
  if (disconnectResetDecision.shouldClearExternalState) {
    state_.externalState = AppRuntimeState::EXTERNAL_STATE_NONE;
  }
  if (disconnectResetDecision.shouldEnableCardDetection) {
    nfc_.enableCardDetection();
  }
}
#endif

} // namespace app::runtime
