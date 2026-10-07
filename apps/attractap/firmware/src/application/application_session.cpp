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




#endif
