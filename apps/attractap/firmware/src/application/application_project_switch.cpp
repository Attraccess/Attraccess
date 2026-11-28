// Changing the project of the card holder's running session (ATT-1421): the project picker, the choice between moving
// the whole session and splitting it from now on, then the request, which goes through the usage form flow like a
// start or a stop.
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
    this->projectSwitchFromProjectId = resource.ownProjectId;
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

// The session the picker, the choice or the usage forms of a switch are for has ended, was moved elsewhere, or is no
// longer offered for a switch: they close. A request already sent is left alone, its refreshed row may precede the
// answer.
void Application::closeStaleProjectSwitch(const API::ResourceBrief &resource) {
  if (this->cardAuthenticationData.username != this->resourceList.authenticatedUsername) return;
  const bool picking = this->projectSwitchUsageId != 0 && Display::isActive(&Display::projectSelectScreen);
  const bool choosing = this->projectSwitchUsageId != 0 && Display::isActive(&Display::projectChangeModeScreen);
  const bool filling = this->pendingActionType == PENDING_ACTION_SWITCH_PROJECT && this->hasPendingFormRequest;
  if (!picking && !choosing && !filling) return;
  const bool open = picking || choosing;
  const uint32_t resourceId = open ? this->projectSwitchResourceId : this->pendingActionResourceId;
  const uint32_t usageId = open ? this->projectSwitchUsageId : this->pendingActionUsageId;
  if (resource.id != resourceId) return;
  // Moving the whole session elsewhere keeps its record; the picker and the choice would describe the old project.
  const bool moved = open && resource.ownProjectId != this->projectSwitchFromProjectId;
  if (resource.canSwitchProject && resource.ownUsageId == usageId && !moved) return;
  if (open) this->cancelProjectPicker();
  else this->handleFormsCancel();
}

void Application::handleProjectPicked(uint32_t projectId, const std::string &projectName) {
  if (this->projectSwitchUsageId == 0) {
    this->handleProjectSelection(projectId, projectName);
    Display::returnFromTransient();
    return;
  }
  this->projectSwitchToProjectId = projectId;
  Display::returnFromTransient();
  this->openProjectChangeModes(projectId == 0 ? std::string() : projectName);
}

void Application::openProjectChangeModes(const std::string &newProjectName) {
  for (uint16_t i = 0; i < this->resourceList.count; ++i) {
    const auto &resource = this->resourceList.items[i];
    if (resource.id != this->projectSwitchResourceId) continue;
    Display::projectChangeModeScreen.configure(
        {.resourceName = resource.name,
         .currentProjectName = resource.ownProjectName,
         .newProjectName = newProjectName,
         .continuation = resource.ownSessionContinued,
         .onChoose = [this](API::ProjectChangeMode mode) { this->handleProjectChangeMode(mode); },
         .onCancel = [this]() { this->cancelProjectPicker(); }});
    Display::transitionToScreen(&Display::projectChangeModeScreen);
    return;
  }
  this->projectSwitchUsageId = 0;
}

void Application::handleProjectChangeMode(API::ProjectChangeMode mode) {
  const uint32_t resourceId = this->projectSwitchResourceId;
  const uint32_t usageId = this->projectSwitchUsageId;
  const uint32_t projectId = this->projectSwitchToProjectId;
  this->projectSwitchUsageId = 0;
  Display::returnFromTransient();
  if (usageId != 0) this->startProjectSwitch(resourceId, usageId, projectId, mode);
}

void Application::cancelProjectPicker() {
  this->projectSwitchUsageId = 0;
  Display::returnFromTransient();
}

void Application::startProjectSwitch(uint32_t resourceId, uint32_t usageId, uint32_t projectId,
                                     API::ProjectChangeMode mode) {
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
  this->pendingProjectChangeMode = mode;
  this->hasPendingFormRequest = false;
  this->formFlowSubmitted = false;
  this->api.switchSessionProject(resourceId, usageId, projectId, mode);
}
#endif
