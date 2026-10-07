// Session coordination: resource/project selection, action buttons, pause timing
// FEATURE: application-session

#include "application.hpp"
#include "platform.hpp"
#include <cstdlib>
#include <cstring>
#include <string>

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

  this->logger.info("Connectivity lost; resetting session state");
  Display::hidePopup();

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

#endif
