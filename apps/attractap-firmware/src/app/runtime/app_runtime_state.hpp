#pragma once

#include "../contracts/api_contracts.hpp"

namespace app::runtime {

struct AppRuntimeState {
  enum ExternalStates_t {
    EXTERNAL_STATE_NONE,
#ifdef HAS_LVGL_DISPLAY
    EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO,
    EXTERNAL_STATE_ENROLL_NEW_CARD,
#endif
    EXTERNAL_STATE_AUTHENTICATE_CARD,
    EXTERNAL_STATE_FIRMWARE_UPDATE,
  };
  ExternalStates_t externalState = EXTERNAL_STATE_NONE;

#ifdef HAS_LVGL_DISPLAY
  struct ApiEnrollNewCardGetAvailableKeyNoData_t {
    String username;
  };
  ApiEnrollNewCardGetAvailableKeyNoData_t apiEnrollNewCardGetAvailableKeyNoData;
  uint32_t apiEnrollNewCardGetAvailableKeyNoStartTimeMs = 0;

  struct ApiEnrollNewCardData_t {
    uint8_t keyNo;
    uint8_t keyBytes[16];
  };
  ApiEnrollNewCardData_t apiEnrollNewCardData;
#endif

  app::contracts::CardAuthenticationDetails cardAuthenticationData;
  int firmwareUpdateProgressPct = 0;
  String availableFirmwareVersion;
  bool unlocked = false;

#ifdef HAS_LVGL_DISPLAY
  uint32_t bootTime = 0;
  bool bootDone = false;
  uint32_t timeOfUnlockedMs = 0;
  static constexpr uint32_t UNLOCKED_TIMEOUT_MS = 30000;
  uint32_t timeOfResourceSelectionMs = 0;
  static constexpr uint32_t RESOURCE_SELECTION_TIMEOUT_MS = 10000;
  uint8_t resourceCount = 0;
  bool resourceIsSelected = false;
#else
  bool resourceIsDoor = false;
#endif

  uint32_t selectedResourceId = 0;

  // Used by auth controller for both display/non-display
  String currentProjectsUser;

#ifndef HAS_LVGL_DISPLAY
  bool cardDetected = false;
  bool cardRemoved = false;
  unsigned long cardDetectionTimeMs = 0;
  bool cardPresentationWasLong = false;
#endif

#ifdef HAS_LVGL_DISPLAY
  bool selectedResourceChanged = false;
  app::contracts::ResourceList resourceList;
  bool resourceListUpdated = false;

  app::contracts::ProjectsOfUserResponse projectsOfUserResponse;
  bool projectsOfUserResponseUpdated = false;
  uint32_t selectedProjectId = 0;
  String selectedProjectName;
  uint32_t projectsCurrentPage = 1;
  uint32_t projectsTotalCount = 0;
  bool projectsHasMore = false;

  enum pending_action_t {
    PENDING_ACTION_NONE,
    PENDING_ACTION_START_SESSION,
    PENDING_ACTION_STOP_SESSION,
  };
  pending_action_t pendingActionType = PENDING_ACTION_NONE;
  uint32_t pendingActionResourceId = 0;
  uint32_t pendingActionProjectId = 0;
  bool hasPendingFormRequest = false;
  volatile bool pendingFormRequestReady = false;
  app::contracts::ResourceUsageFormRequest pendingFormRequest;
  app::contracts::FormSubmissionList formSubmissionBuffer;

  uint32_t pauseStartMs = 0;
  uint32_t accumulatedPauseMs = 0;
  uint16_t actionInProgressCount = 0;
#endif

  enum applicationState_t {
#ifdef HAS_LVGL_DISPLAY
    APPLICATION_STATE_BOOT,
    APPLICATION_STATE_PIN_NOT_SET,
    APPLICATION_STATE_NFC_INIT_FAILED,
#endif
    APPLICATION_STATE_CONFIGURATION_REQUIRED,
    APPLICATION_STATE_INIT,
    APPLICATION_STATE_CUSTOM,
#ifdef HAS_LVGL_DISPLAY
    APPLICATION_STATE_LOCKED,
#endif
    APPLICATION_STATE_AUTHENTICATE_CARD,
    APPLICATION_STATE_NO_RESOURCES,
#ifdef HAS_LVGL_DISPLAY
    APPLICATION_STATE_RESOURCE_LIST,
    APPLICATION_STATE_UNLOCKED,
    APPLICATION_STATE_ENROLLMENT,
#else
    APPLICATION_STATE_WAIT_FOR_CARD,
#endif
    APPLICATION_STATE_FIRMWARE_UPDATE
  };
  applicationState_t state = APPLICATION_STATE_INIT;
};

} // namespace app::runtime
