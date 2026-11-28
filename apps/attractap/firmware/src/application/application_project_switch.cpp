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
    // Every switch starts on the first page of all projects, not where the picker was last left.
    Display::projectSelectScreen.resetProjectsSearch();
    Display::projectSelectScreen.begin();
    Display::transitionToScreen(&Display::projectSelectScreen);
    return;
  }
}

// The session the picker or the usage forms of a switch are for has ended, was moved elsewhere, or is no longer
// offered for a switch: they close. A request already sent is left alone, its refreshed row may precede the answer.
void Application::closeStaleProjectSwitch(const API::ResourceBrief &resource) {
  if (this->cardAuthenticationData.username != this->resourceList.authenticatedUsername) return;
  const bool picking = this->projectSwitchUsageId != 0 && Display::isActive(&Display::projectSelectScreen);
  const bool filling = this->pendingActionType == PENDING_ACTION_SWITCH_PROJECT && this->hasPendingFormRequest;
  if (!picking && !filling) return;
  const uint32_t resourceId = picking ? this->projectSwitchResourceId : this->pendingActionResourceId;
  const uint32_t usageId = picking ? this->projectSwitchUsageId : this->pendingActionUsageId;
  if (resource.id != resourceId || (resource.canSwitchProject && resource.ownUsageId == usageId)) return;
  if (picking) this->cancelProjectPicker();
  else this->handleFormsCancel();
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
#endif
