#include "../app_runtime.hpp"

namespace app::runtime {

bool AppRuntime::handleConfigurationAndConnectivityGates() {
  app::contracts::AttraccessApiConfig attraaccessApiConfig =
      settings_.getAttraccessApiConfig();
  bool connectionIsConfigured = !attraaccessApiConfig.hostname.isEmpty() &&
                                attraaccessApiConfig.hostname != "" &&
                                attraaccessApiConfig.port > 0;

  ConnectivityController::ConnectionConfigurationDecision configDecision =
      connectivityController_.evaluateConnectionConfiguration(
          connectionIsConfigured,
          state_.state == AppRuntimeState::APPLICATION_STATE_CONFIGURATION_REQUIRED,
#ifdef HAS_LVGL_DISPLAY
          true
#else
          false
#endif
      );
  if (configDecision.shouldHandle) {
    if (configDecision.shouldEnterConfigurationRequiredState) {
      logger_.debug("Connection is not configured, showing connection "
                    "configuration screen");
      state_.state = AppRuntimeState::APPLICATION_STATE_CONFIGURATION_REQUIRED;
    }
    if (configDecision.shouldDisableConnectionAttempts) {
      api_.disableConnectionAttempts();
    }
#ifdef HAS_LVGL_DISPLAY
    if (configDecision.shouldDisablePinLock) {
      ui_.connectionConfigDisablePinLock();
    }
    if (configDecision.shouldTransitionToConnectionConfigurationScreen) {
      ui_.transitionToConnectionConfigurationScreen();
    }
#endif
    return true;
  }

  ConnectivitySnapshot connectivitySnapshot =
      connectivityState_.getSnapshot();
  ConnectivityController::ConnectivityStateDecision connectivityDecision =
      connectivityController_.evaluateConnectivityState(
          connectivitySnapshot.apiAuthenticated,
          connectivitySnapshot.networkConnected,
          connectivitySnapshot.websocketConnected,
          state_.state == AppRuntimeState::APPLICATION_STATE_INIT,
          state_.state == AppRuntimeState::APPLICATION_STATE_CONFIGURATION_REQUIRED,
#ifdef HAS_LVGL_DISPLAY
          true
#else
          false
#endif
      );
  if (!connectivityDecision.shouldHandleDisconnectedState) {
    return false;
  }
#ifdef HAS_LVGL_DISPLAY
  if (connectivityDecision.shouldResetSessionOnDisconnect) {
    resetSessionOnDisconnect();
  }
#endif
  if (connectivityDecision.shouldEnterInitState) {
    logger_.debug("API/network/websocket disconnected, showing init screen");
    state_.state = AppRuntimeState::APPLICATION_STATE_INIT;
  }
#ifdef HAS_LVGL_DISPLAY
  if (connectivityDecision.shouldTransitionToInitScreen) {
    ui_.transitionToInitScreen();
  }
#endif
  return true;
}

bool AppRuntime::handleExternalAuthTransition() {
  if (state_.externalState != AppRuntimeState::EXTERNAL_STATE_AUTHENTICATE_CARD) {
    return false;
  }
  AuthController::ExternalAuthTransitionDecision authTransitionDecision =
      authController_.evaluateExternalAuthenticateTransition(
          state_.externalState == AppRuntimeState::EXTERNAL_STATE_AUTHENTICATE_CARD,
          state_.state == AppRuntimeState::APPLICATION_STATE_AUTHENTICATE_CARD,
#ifdef HAS_LVGL_DISPLAY
          true
#else
          false
#endif
      );
  if (authTransitionDecision.shouldReturnEarly) {
    return true;
  }

#ifdef HAS_LVGL_DISPLAY
  if (authTransitionDecision.shouldPopulateUserDetails) {
    app::contracts::ResourceDetailsUserDetails userDetails;
    userDetails.username = state_.cardAuthenticationData.username;
    userDetails.canManageResource =
        state_.cardAuthenticationData.canManageResource;
    userDetails.hasIntroduction = state_.cardAuthenticationData.hasIntroduction;
    userDetails.isIntroducer = state_.cardAuthenticationData.isIntroducer;
    ui_.resourceDetailsSetUserDetails(userDetails);
  }
#endif
  if (authTransitionDecision.shouldEnterAuthenticateState) {
    state_.state = AppRuntimeState::APPLICATION_STATE_AUTHENTICATE_CARD;
  }
  if (authTransitionDecision.shouldProcessCardAuthenticationNow) {
    processCardAuthenticationData();
  }
  if (authTransitionDecision.shouldEnableCardDetection) {
    nfc_.enableCardDetection();
  }
  return true;
}

bool AppRuntime::handleExternalFirmwareUpdateTransition() {
  if (state_.externalState != AppRuntimeState::EXTERNAL_STATE_FIRMWARE_UPDATE) {
    return false;
  }
  UpdateController::ExternalFirmwareUpdateDecision firmwareDecision =
      updateController_.evaluateExternalFirmwareUpdateTransition(
          state_.externalState == AppRuntimeState::EXTERNAL_STATE_FIRMWARE_UPDATE,
          state_.state == AppRuntimeState::APPLICATION_STATE_FIRMWARE_UPDATE,
#ifdef HAS_LVGL_DISPLAY
          true
#else
          false
#endif
      );
  if (!firmwareDecision.shouldHandle) {
    return false;
  }
  if (firmwareDecision.shouldUpdateProgress) {
    logger_.debugf("Updating firmware update progress %d",
                   state_.firmwareUpdateProgressPct);
#ifdef HAS_LVGL_DISPLAY
    ui_.firmwareUpdateSetProgress(state_.firmwareUpdateProgressPct);
    ui_.firmwareUpdateSetAvailableVersion(state_.availableFirmwareVersion);
#endif
  }
#ifdef HAS_LVGL_DISPLAY
  if (firmwareDecision.shouldTransitionToFirmwareScreen) {
    ui_.transitionToFirmwareUpdateScreen();
  }
#endif
  if (firmwareDecision.shouldEnterFirmwareUpdateState) {
    state_.state = AppRuntimeState::APPLICATION_STATE_FIRMWARE_UPDATE;
  }
  return true;
}

void AppRuntime::processState() {
#ifdef HAS_LVGL_DISPLAY
  if (state_.state == AppRuntimeState::APPLICATION_STATE_NFC_INIT_FAILED) {
    return;
  }
#endif

  if (handleConfigurationAndConnectivityGates()) {
    return;
  }

#ifdef HAS_LVGL_DISPLAY
  if (handleDisplayBootAndPinGates()) {
    return;
  }
  if (handleEnrollmentTransitions()) {
    return;
  }
#else
  handleNonDisplayPresentationSignal();
#endif

  if (handleExternalAuthTransition()) {
    return;
  }
  if (handleExternalFirmwareUpdateTransition()) {
    return;
  }

#ifdef HAS_LVGL_DISPLAY
  (void)handleDisplayResourceAndSessionFlow();
#else
  (void)handleNonDisplayActionFlow();
#endif
}

} // namespace app::runtime
