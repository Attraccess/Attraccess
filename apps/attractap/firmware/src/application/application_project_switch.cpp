// Switching the project of the card holder's running session (ATT-1421): the project picker, then the request,
// which goes through the usage form flow like a start or a stop.
// FEATURE: application-session

#include "application.hpp"
#include "../platform.hpp"
#include <string>

#ifdef HAS_LVGL_DISPLAY
void Application::openProjectSwitch() {
  for (uint16_t i = 0; i < this->resourceList.count; ++i) {
    const auto &resource = this->resourceList.items[i];
    if (resource.id != this->selectedResourceId || !resource.canSwitchProject) continue;
    this->projectSwitchResourceId = resource.id;
    this->projectSwitchUsageId = resource.ownUsageId;
    Display::projectSelectScreen.setSwitchTarget(true, resource.ownProjectId);
    // No highlight: the current project is the disabled entry, and its caption has to stay readable.
    Display::projectSelectScreen.setSelectedProject(0);
    Display::projectSelectScreen.setResourceName(resource.name);
    Display::projectSelectScreen.begin();
    Display::transitionToScreen(&Display::projectSelectScreen);
    return;
  }
}

void Application::handleProjectPicked(uint32_t projectId, const std::string &projectName) {
  const uint32_t resourceId = this->projectSwitchResourceId;
  const uint32_t usageId = this->projectSwitchUsageId;
  this->projectSwitchUsageId = 0;
  if (usageId == 0) this->handleProjectSelection(projectId, projectName);
  Display::returnFromTransient();
  if (usageId != 0) this->startProjectSwitch(resourceId, usageId, projectId);
}

void Application::cancelProjectPicker() {
  this->projectSwitchUsageId = 0;
  Display::returnFromTransient();
}

void Application::startProjectSwitch(uint32_t resourceId, uint32_t usageId, uint32_t projectId) {
  if (!this->unlocked || !this->pendingUiAction.empty() || this->waitingForResourceRefresh) return;
  this->pendingUiAction = "SWITCH_SESSION_PROJECT";
  this->pendingUiResourceId = resourceId;
  this->pendingUiStartedAt = millis();
  this->showReaderActionProgress(FirmwareI18n::Message::SwitchingProject);
  this->beginActionPause();
  this->pendingActionType = PENDING_ACTION_SWITCH_PROJECT;
  this->pendingActionResourceId = resourceId;
  this->pendingActionProjectId = projectId;
  this->pendingActionUsageId = usageId;
  this->pendingActionIsTakeover = false;
  this->hasPendingFormRequest = false;
  this->formFlowSubmitted = false;
  this->api.switchSessionProject(resourceId, usageId, projectId);
}

API::ResourceUsageFormActionType Application::pendingFormAction() const {
  switch (this->pendingActionType) {
  case PENDING_ACTION_START_SESSION:
    return this->pendingActionIsTakeover ? API::ResourceUsageFormActionType::TAKEOVER
                                         : API::ResourceUsageFormActionType::START;
  case PENDING_ACTION_STOP_SESSION:
    return API::ResourceUsageFormActionType::END;
  case PENDING_ACTION_SWITCH_PROJECT:
    return API::ResourceUsageFormActionType::PROJECT_SWITCH;
  default:
    return API::ResourceUsageFormActionType::UNKNOWN;
  }
}
#endif
