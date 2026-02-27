#include "../app_runtime.hpp"
#include "../../../utils.hpp"
#include <cstring>

namespace app::runtime {

void AppRuntime::handleResourceListUpdated(
    const app::events::ResourceListUpdatedEvent &event) {
#ifdef HAS_LVGL_DISPLAY
  handleResourceListUpdate(event.resourceList);
#else
  if (event.resourceList.count > 0) {
    state_.selectedResourceId = event.resourceList.items[0].id;
    state_.resourceIsDoor = event.resourceList.items[0].type == 1;
  }
#endif
}

void AppRuntime::handleCardAuthDetails(
    const app::events::CardAuthDetailsEvent &event) {
  AuthController::CardDetailsDecision d =
      authController_.handleCardDetails(event.response, state_.currentProjectsUser);
  if (d.shouldBeepError) {
    if (event.response.error.length() > 0) {
      logger_.errorf("Authentication failed: %s", event.response.error.c_str());
    } else {
      logger_.error("Invalid key bytes provided");
    }
    beeper_.errorBeep();
  }
  if (d.shouldEnableCardDetection) {
    nfc_.enableCardDetection();
  }
  if (!d.valid) {
    state_.externalState = AppRuntimeState::EXTERNAL_STATE_AUTHENTICATE_CARD;
    return;
  }

  state_.cardAuthenticationData = event.response;
#ifdef HAS_LVGL_DISPLAY
  if (d.shouldClearProjectSelection) {
    clearProjectSelection();
  }
  state_.currentProjectsUser = d.username;
  if (d.shouldRequestProjects) {
    requestProjectsPage(1);
  }
#endif
  if (d.shouldSetExternalAuthenticateState) {
    state_.externalState = AppRuntimeState::EXTERNAL_STATE_AUTHENTICATE_CARD;
  }
}

#ifdef HAS_LVGL_DISPLAY
void AppRuntime::handleEnrollGetAvailableKeyNo(
    const app::events::EnrollGetAvailableKeyNoEvent &event) {
  state_.apiEnrollNewCardGetAvailableKeyNoData = {.username = event.username};
  state_.externalState =
      AppRuntimeState::EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO;
}

void AppRuntime::handleEnrollNewCard(
    const app::events::EnrollNewCardEvent &event) {
  uint8_t keyBytes[16] = {0};
  stringToHexArray(event.key, keyBytes, 16);
  state_.apiEnrollNewCardData = {
      .keyNo = event.keyNo,
      .keyBytes = {0},
  };
  memcpy(state_.apiEnrollNewCardData.keyBytes, keyBytes, 16);
  state_.externalState = AppRuntimeState::EXTERNAL_STATE_ENROLL_NEW_CARD;
}

void AppRuntime::handleProjectsResponse(
    const app::events::ProjectsResponseEvent &event) {
  state_.projectsOfUserResponse = event.response;
  state_.projectsCurrentPage = event.response.page;
  state_.projectsTotalCount = event.response.total;
  state_.projectsHasMore = event.response.hasMore;
  state_.projectsOfUserResponseUpdated = true;
}

void AppRuntime::handleResourceFormsRequest(
    const app::events::ResourceFormsRequestEvent &event) {
  state_.pendingFormRequest = event.request;
  handleFormsRequest(state_.pendingFormRequest);
}
#endif

void AppRuntime::handleFirmwareMeta(const app::events::FirmwareMetaEvent &event) {
  UpdateController::FirmwareMetaEventDecision decision =
      updateController_.evaluateFirmwareMetaEvent(true);
  if (decision.shouldSetExternalFirmwareUpdateState) {
    state_.externalState = AppRuntimeState::EXTERNAL_STATE_FIRMWARE_UPDATE;
  }
  if (decision.shouldStoreAvailableVersion) {
    state_.availableFirmwareVersion = event.availableVersion;
  }
}

void AppRuntime::handleFirmwareProgress(
    const app::events::FirmwareProgressEvent &event) {
  UpdateController::FirmwareProgressEventDecision decision =
      updateController_.evaluateFirmwareProgressEvent(true);
  if (decision.shouldLogProgress) {
    logger_.debugf("Got firmware update pct %d", event.progressPct);
  }
  if (decision.shouldSetExternalFirmwareUpdateState) {
    state_.externalState = AppRuntimeState::EXTERNAL_STATE_FIRMWARE_UPDATE;
  }
  if (decision.shouldStoreProgress) {
    state_.firmwareUpdateProgressPct = event.progressPct;
  }
}

void AppRuntime::processCardAuthenticationData() {
  logger_.infof("Trying to authenticate with keyNo: %u",
                state_.cardAuthenticationData.keyNo);
  bool keyLenValid = authController_.isCardAuthKeyLengthValid(
      state_.cardAuthenticationData.keyLen);

  bool authenticated = false;
  if (keyLenValid) {
    authenticated = nfc_.authenticate(state_.cardAuthenticationData.keyNo,
                                      state_.cardAuthenticationData.keyBytes);
  }

  AuthController::CardAuthenticationExecutionDecision authDecision =
      authController_.evaluateCardAuthenticationExecution(
          keyLenValid, authenticated,
#ifdef HAS_LVGL_DISPLAY
          true
#else
          false
#endif
      );

  if (authDecision.shouldLogInvalidKey) {
    logger_.error("Invalid key bytes provided");
  }
  if (authDecision.shouldLogAuthFailed) {
    logger_.error("Authentication failed");
  }
  if (authDecision.shouldErrorBeep) {
    beeper_.errorBeep();
  }
  if (authDecision.shouldEnableCardDetection) {
    nfc_.enableCardDetection();
  }
  if (authDecision.shouldKeepExternalAuthenticateState) {
    state_.externalState = AppRuntimeState::EXTERNAL_STATE_AUTHENTICATE_CARD;
  }
  if (authDecision.shouldFail) {
    return;
  }

  if (authDecision.shouldSuccessBeep) {
    beeper_.successBeep();
    logger_.info("Authentication successful");
  }
  if (authDecision.shouldClearExternalState) {
    state_.externalState = AppRuntimeState::EXTERNAL_STATE_NONE;
  }
  if (authDecision.shouldUnlock) {
    state_.unlocked = true;
  }
}

} // namespace app::runtime
