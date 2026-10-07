#include "application.hpp"
#include "platform.hpp"

void Application::renderResourceState()
{
#ifdef HAS_LVGL_DISPLAY
  uint32_t now = millis();
  if (!this->pendingUiAction.empty() && !this->hasPendingFormRequest &&
      now - this->pendingUiStartedAt > 60000) {
    this->finishReaderAction(false);
    this->handleFormsCancel();
    Display::showErrorPopup("Aktion nicht bestätigt", "Der Ressourcenstatus wird neu geladen. Bitte vor einem erneuten Versuch prüfen.");
  }
  // Finishing an action starts a new refresh timer; do not subtract its newer
  // timestamp from the earlier sample and wrap the unsigned elapsed duration.
  now = millis();
  if (this->waitingForResourceRefresh && now - this->pendingUiStartedAt > 30000) {
    this->logoutReader();
    Display::showErrorPopup("Status nicht verfügbar", "Bitte erneut anmelden, um den aktuellen Ressourcenstatus zu laden.");
  }
  if (this->unlocked) {
    uint32_t effectivePause = this->accumulatedPauseMs;
    if (this->actionInProgressCount > 0) effectivePause += now - this->pauseStartMs;
    uint32_t elapsed = now - this->timeOfUnlockedMs;
    elapsed = elapsed > effectivePause ? elapsed - effectivePause : 0;
    if (elapsed > this->UNLOCKED_TIMEOUT_MS) this->logoutReader();
  }
  if (this->selectedResourceChanged) {
    this->updateSelectedResourceDetails();
    this->selectedResourceChanged = false;
  }
  if (this->projectsOfUserResponseUpdated && this->unlocked) {
    Display::resourceDetailsScreen.setProjects(this->projectsOfUserResponse);
    Display::resourceDetailsScreen.setSelectedProject(this->selectedProjectId, this->selectedProjectName.c_str());
    this->projectsOfUserResponseUpdated = false;
  }
  if (this->resourceListUpdated) {
    Display::resourceListScreen.setResourceList(this->resourceList);
    this->resourceListUpdated = false;
  }
  if (this->resourceCount == 0) {
    if (this->state != APPLICATION_STATE_NO_RESOURCES) {
      this->logoutReader();
      this->state = APPLICATION_STATE_NO_RESOURCES;
      Display::transitionToScreen(&Display::noResourcesScreen);
    }
    return;
  }
  if (!this->resourceIsSelected) {
    Display::resourceListScreen.setAuthenticatedUser(this->unlocked ? this->cardAuthenticationData.username : "");
    const auto target = this->unlocked ? APPLICATION_STATE_RESOURCE_LIST_AUTHENTICATED : APPLICATION_STATE_RESOURCE_LIST;
    if (this->state != target) {
      this->state = target;
      Display::transitionToScreen(&Display::resourceListScreen);
      if (!this->unlocked && !this->cardAuthenticationPending) this->nfc.enableCardDetection();
    }
    return;
  }
  if (!this->unlocked) {
    if (this->state == APPLICATION_STATE_LOCKED) {
      if (!this->cardAuthenticationPending && now - this->timeOfResourceSelectionMs > this->RESOURCE_SELECTION_TIMEOUT_MS) {
        this->resourceIsSelected = false;
        this->selectedResourceId = 0;
      }
      return;
    }
    this->state = APPLICATION_STATE_LOCKED;
    Display::transitionToScreen(&Display::lockscreen, [this] { this->nfc.enableCardDetection(); });
    return;
  }
  if (this->state != APPLICATION_STATE_UNLOCKED) {
    this->state = APPLICATION_STATE_UNLOCKED;
    Display::transitionToScreen(&Display::resourceDetailsScreen);
  }
#else

  // Process unlocked card actions for non-display mode
  if (this->state == APPLICATION_STATE_AUTHENTICATE_CARD) {
    if (!this->cardDetected) {
      return;
    }

    if (!this->unlocked) {
      return;
    }

    if (!this->cardRemoved) {
      return;
    }

    this->logger.debug("Card detected and removed and unlocked, processing");

    // Reset state flags before triggering action
    this->unlocked = false;
    this->cardDetected = false;
    this->cardRemoved = false;

    if (this->resourceIsDoor) {
      if (this->cardPresentationWasLong) {
        this->api.lockDoor(this->selectedResourceId);
      } else {
        this->api.unlockDoor(this->selectedResourceId);
      }
    } else {
      if (this->cardPresentationWasLong) {
        this->api.stopResourceUsageSession(this->selectedResourceId);
      } else {
        this->api.startResourceUsageSession(this->selectedResourceId);
      }
    }

    // Reset state back to waiting for card
    this->state = APPLICATION_STATE_WAIT_FOR_CARD;
    this->nfc.enableCardDetection();
    return;
  }

  if (this->state != APPLICATION_STATE_WAIT_FOR_CARD) {
    this->logger.debug("Waiting for card detection");
    this->state = APPLICATION_STATE_WAIT_FOR_CARD;
    this->nfc.enableCardDetection();
    return;
  }
#endif
}
