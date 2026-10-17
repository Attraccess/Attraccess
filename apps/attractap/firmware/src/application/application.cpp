// Composition root: wires API/NFC/display callbacks, spawns tasks, runs loop
// FEATURE: application

#include "application.hpp"
#include "../serial/serialCommandHandler.hpp"
#include "../platform.hpp"
#include <cstring>
#include <string>
#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#include "esp_task_wdt.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#endif

void Application::networkTask(void *parameter) {
#ifdef ESP_PLATFORM
  esp_task_wdt_add(NULL);
#endif
  while (true) {
#ifdef ESP_PLATFORM
    esp_task_wdt_reset();
#endif
    Network::loop();
#ifdef ESP_PLATFORM
    vTaskDelay(100 / portTICK_PERIOD_MS);
#endif
  }
}

#ifdef HAS_WS2812_LED
void Application::ledTask(void *parameter) {
  Application *app = static_cast<Application *>(parameter);
  while (true) {
    app->led.loop();
    vTaskDelay(50 / portTICK_PERIOD_MS);
  }
}
#endif

void Application::setup() {
#ifdef ESP_PLATFORM
  // Confirm OTA image on first boot after update to avoid rollback
  const esp_partition_t *running = esp_ota_get_running_partition();
  esp_ota_img_states_t ota_state;
  if (esp_ota_get_state_partition(running, &ota_state) == ESP_OK) {
    if (ota_state == ESP_OTA_IMG_PENDING_VERIFY) {
      // Minimal diagnostic succeeded; mark image valid
      esp_ota_mark_app_valid_cancel_rollback();
    }
  }
#endif

  Settings::setup();
  this->setupBootDiagnostics();
  SerialCommandHandler::setup();
#ifndef DEMO_MODE
  Network::setup();
#else
  DemoStore::setup();
  // Preset a non-empty hostname so processState() skips the "not configured" branch
  Settings::saveAttraccessApiConfig("demo-local", 80, false);
  // Skip PIN screen
  Settings::setDevicePin("demo");
#endif

#ifdef HAS_IO_EXPANDER
    this->ioExpander.setup();
    this->beeper.setup(&this->ioExpander);
#ifdef HAS_LVGL_DISPLAY
    Display::setup(&this->ioExpander);
#endif
#else
  this->beeper.setup();
#ifdef HAS_LVGL_DISPLAY
#ifndef ATTRACTAP_HOST
  Display::setup();
#endif
#endif
#endif

#ifdef HAS_WS2812_LED
  this->led.setup();
  xTaskCreate(Application::ledTask, "LedTask", 2048, this,
              tskIDLE_PRIORITY, nullptr);
#endif

  this->nfc.setup();

  this->api.setup();

  this->setupApiCallbacks();

  this->setupErrorCallbacks();

  this->setupActionCallbacks();

  this->setupDisplayCallbacks();
  this->setupCardCallbacks();
  this->setupFormCallbacks();

  this->setupNfcCallbacks();

#if !defined(DEMO_MODE) && defined(ESP_PLATFORM)
  xTaskCreate(Application::networkTask, "NetworkTask", 4096, nullptr,
              tskIDLE_PRIORITY, nullptr);
#endif

#ifdef ESP_PLATFORM
  esp_task_wdt_add(NULL);
#endif

#ifdef HAS_LVGL_DISPLAY
  this->bootTime = millis();
#else
  this->state = APPLICATION_STATE_INIT;
#endif
}

void Application::loop() {
#ifdef ESP_PLATFORM
  esp_task_wdt_reset();
#endif

  this->snapshotBootDiagnostics();

  SerialCommandHandler::loop();

#ifdef HAS_LVGL_DISPLAY
  Display::loop();
#endif

  // NFC polling back on the main loop (ATT-554 item 6 reverted for isolation:
  // the dedicated NFC task + concurrent bus use is the prime suspect for the
  // field I2C wedge). Blocking PN532 time costs only this loop — rendering and
  // touch live on LvglTask.
  this->nfc.loop();

  this->api.loop();

#ifdef HAS_LVGL_DISPLAY
  // processState mutates LVGL (screen transitions, popups, screen setters);
  // rendering runs on LvglTask, so serialize with lv_lock (recursive).
  lv_lock();
  this->processState();
  this->pollUsageStats();
  lv_unlock();
#else
  this->processState();
#endif

#ifdef ESP_PLATFORM
  vTaskDelay(pdMS_TO_TICKS(1));
#endif
}

// Session coordination: resource/project selection, action buttons, pause timing
// FEATURE: application-session

#include <cstdlib>

#ifdef HAS_LVGL_DISPLAY
void Application::finishReaderAction(bool success) {
  if (this->pendingUiAction.empty()) return;
  const auto type = this->pendingUiAction;
  this->pendingUiAction.clear();
  this->waitingForResourceRefresh = true;
  this->pendingUiStartedAt = millis();
  Display::resourceDetailsScreen.hideFormsModal();
  if (this->returnToListAfterAction) this->resourceIsSelected = false;
  this->actionCompletionMessage = success
      ? type == "START_RESOURCE_USAGE_SESSION" ? "Nutzung gestartet"
      : type == "STOP_RESOURCE_USAGE_SESSION" ? "Nutzung beendet" : "Aktion bestätigt"
      : "";
  // Keep input blocked until fresh ownership/availability arrives, so a fast
  // second tap cannot act on the row's pre-action state.
  this->showReaderActionProgress("Status wird geladen");
  this->api.cancelResourceAction();
  this->resourceRefreshRequestId = this->api.requestResourceList();
}

void Application::beginSessionSummary(const API::ActionResult &result) {
  Display::hidePopup();
  this->onActionResult(result.type);
  this->clearFormPageCache();
  this->pendingFormFieldsReady = false;
  this->pendingFormPageResultReady = false;
  this->formCursorFormIdx = 0;
  this->formCursorOffset = 0;
  this->awaitingFieldRender = false;
  this->pendingActionResourceId = 0;
  this->pendingActionProjectId = 0;
  this->pendingActionIsTakeover = false;
  this->pendingFormRequestResourceId = 0;
  this->pendingFormRequestAction = API::ResourceUsageFormActionType::UNKNOWN;
  this->pendingUiAction.clear();
  this->waitingForResourceRefresh = false;
  this->returnToListAfterAction = false;
  this->actionCompletionMessage.clear();
  this->api.cancelResourceAction();
  this->resetPauseAccounting();
  Display::resourceListScreen.hideActionProgress();
  Display::resourceDetailsScreen.hideActionProgress();
  this->sessionSummaryActive = true;
  this->sessionSummaryVisible = false;
  this->sessionSummaryDismissRequested = false;
  this->sessionSummaryTouchSequence = Display::touchPressSequence;
  this->state = APPLICATION_STATE_SESSION_SUMMARY;
  Display::sessionSummaryScreen.setSummary(this->cardAuthenticationData.username, result.durationSeconds, result.billingTotal);
  Display::transitionToScreen(&Display::sessionSummaryScreen, [this] {
    if (!this->sessionSummaryActive) return;
    this->sessionSummaryShownAt = millis();
    this->sessionSummaryVisible = true;
  });
  // Do not reset presence: a card already held must first leave the field.
  this->nfc.enableCardDetection();
}

void Application::dismissSessionSummary() {
  if (!this->sessionSummaryActive) return;
  this->logoutReader();
}

void Application::logoutReader() {
  this->sessionSummaryActive = false;
  this->sessionSummaryVisible = false;
  this->sessionSummaryDismissRequested = false;
  Display::sessionSummaryScreen.clearSummary();
  Display::hidePopup();
  this->handleFormsCancel();
  this->finishCardAuthentication(false);
  this->unlocked = false;
  this->resourceIsSelected = false;
  this->selectedResourceId = 0;
  this->returnToListAfterAction = false;
  this->pendingUiAction.clear();
  this->api.cancelResourceAction();
  this->waitingForResourceRefresh = false;
  this->actionCompletionMessage.clear();
  Display::resourceDetailsScreen.hideActionProgress();
  this->currentProjectsUser.clear();
  this->cardAuthenticationData = {};
  this->clearProjectSelection();
  this->resetPauseAccounting();
  Display::resourceListScreen.setAuthenticatedUser("");
  Display::resourceListScreen.hideActionProgress();
  this->nfc.enableCardDetection();
}

void Application::finishCardAuthentication(bool success) {
  this->cardAuthenticationPending = false;
  Display::resourceListScreen.hideActionProgress();
  Display::lockscreen.hideActionProgress();
  if (success) {
    this->restartSessionTimeout();
    this->selectedResourceChanged = true;
  } else {
    this->externalState = EXTERNAL_STATE_NONE;
    this->state = APPLICATION_STATE_INIT;
    this->nfc.enableCardDetection();
  }
}
void Application::pollUsageStats() {
  const API::ResourceBrief *resource = nullptr;
  if (this->unlocked && this->resourceIsSelected && this->state == APPLICATION_STATE_UNLOCKED &&
      this->cardAuthenticationData.username == this->resourceList.authenticatedUsername) {
    for (uint16_t i = 0; i < this->resourceList.count; ++i)
      if (this->resourceList.items[i].id == this->selectedResourceId) resource = &this->resourceList.items[i];
  }
  if (!resource || !resource->hasActiveUsage || !resource->activeUsageId ||
      this->cardAuthenticationData.username != resource->activeUser) {
    this->usageStatsResourceId = 0;
    this->usageStatsUsageId = 0;
    return;
  }
  const uint32_t now = millis();
  if (this->usageStatsResourceId != resource->id || this->usageStatsUsageId != resource->activeUsageId ||
      now - this->usageStatsRequestedAt >= 10000) {
    this->usageStatsResourceId = resource->id;
    this->usageStatsUsageId = resource->activeUsageId;
    this->usageStatsRequestedAt = now;
    this->api.requestUsageStats(resource->id);
  }
}

#endif

#ifdef HAS_LVGL_DISPLAY
void Application::beginEnrollment() {
  // WAIT_FOR_CARD rides the normal card-detection loop, which re-arms the
  // reader reliably across removals/re-presentations. (The earlier poll-only
  // approach wedged the PN532 after the auth performed for an already-enrolled
  // card, so a freshly presented card was never seen until timeout — ATT-503.)
  // Detection is disabled again only for the auth/write once a card is picked.
  this->enrollCardDetected = false;
  this->nfc.resetCardPresence();
  this->nfc.enableCardDetection();
  this->enrollPhase = ENROLL_PHASE_WAIT_FOR_CARD;
  this->enrollKeyMaterialReady = false;
  this->enrollCancelRequested = false;
  this->enrollErrorPending = false;
  this->enrollErrorMessage[0] = '\0';
  this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs = millis();
  this->enrollPhaseChangedMs = this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs;

  Display::enrollmentScreen.setUserName(
      this->apiEnrollNewCardGetAvailableKeyNoData.username);
  Display::enrollmentScreen.setEnrollmentTimeoutTime(
      this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs + ENROLLMENT_TIMEOUT_MS);
  Display::enrollmentScreen.setStatus(EnrollmentScreen::STATUS_WAITING);
  Display::transitionToScreen(&Display::enrollmentScreen);

  this->state = APPLICATION_STATE_ENROLLMENT;
  this->externalState = EXTERNAL_STATE_NONE;
}

void Application::exitEnrollment() {
  this->enrollPhase = ENROLL_PHASE_NONE;
  this->externalState = EXTERNAL_STATE_NONE;
  this->unlocked = false;
  // Hand back to the generic screen routing; next processState() iteration
  // re-evaluates and transitions to the correct idle screen (lock / list /
  // no-resources), re-enabling card detection on the way.
  this->state = APPLICATION_STATE_INIT;
}

void Application::processEnrollment() {
  uint32_t now = millis();

  // Explicit cancel (device touch button) wins over everything else.
  if (this->enrollCancelRequested) {
    this->enrollCancelRequested = false;
    this->logger.debug("Enrollment cancelled by user");
    this->api.sendEnrollNewCardCancel();
    this->exitEnrollment();
    return;
  }

  // Overall timeout — but never interrupt the brief success confirmation.
  if (this->enrollPhase != ENROLL_PHASE_SUCCESS &&
      now - this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs >
          ENROLLMENT_TIMEOUT_MS) {
    this->logger.error("Enrollment timeout reached");
    this->api.sendEnrollNewCardCancel();
    this->exitEnrollment();
    return;
  }

  // Server-reported error (e.g. card already enrolled). Surface it, then the
  // ERROR dwell loop retries within the remaining time.
  if (this->enrollErrorPending) {
    this->enrollErrorPending = false;
    this->beeper.errorBeep();
    Display::enrollmentScreen.setStatus(EnrollmentScreen::STATUS_ERROR);
    Display::enrollmentScreen.setStatusMessage(this->enrollErrorMessage);
    this->enrollPhase = ENROLL_PHASE_ERROR;
    this->enrollPhaseChangedMs = now;
    return;
  }

  switch (this->enrollPhase) {
  case ENROLL_PHASE_WAIT_FOR_CARD: {
    // The detection loop flags a card via the card-detection callback; until
    // then there is nothing to do but keep the screen up.
    if (!this->enrollCardDetected) {
      break;
    }
    this->enrollCardDetected = false;

    // Take exclusive control of the PN532 for the authenticate + write that
    // follow, so the detection loop doesn't probe the card underneath us.
    this->nfc.disableCardDetection();

    uint8_t uid[7] = {0};
    uint8_t uidLength = 0;
    uint8_t keyNo = 0;
    if (this->nfc.getAvailableKeyNo(uid, &uidLength, &keyNo)) {
      this->api.sendEnrollNewCardAvailableKeyNo(uid, uidLength, keyNo);
      this->enrollPhase = ENROLL_PHASE_REQUESTED_KEY;
      this->enrollPhaseChangedMs = now;
    } else {
      // Card slipped away or has no writable key. Surface the failure instead
      // of silently re-arming, otherwise DESFire setup/auth failures look like
      // the reader ignored the card.
      this->beeper.errorBeep();
      Display::enrollmentScreen.setStatus(EnrollmentScreen::STATUS_ERROR);
      Display::enrollmentScreen.setStatusMessage(
          "Karte konnte nicht\nvorbereitet werden");
      this->enrollPhase = ENROLL_PHASE_ERROR;
      this->enrollPhaseChangedMs = now;
      this->nfc.resetCardPresence();
    }
    break;
  }

  case ENROLL_PHASE_REQUESTED_KEY: {
    // Key material arrives asynchronously via the API callback, which only
    // sets a flag — the actual write happens here on the main loop.
    if (this->enrollKeyMaterialReady) {
      this->enrollKeyMaterialReady = false;
      Display::enrollmentScreen.setStatus(EnrollmentScreen::STATUS_WRITING);
      this->enrollPhase = ENROLL_PHASE_WRITING;
      this->enrollPhaseChangedMs = now;
    }
    break;
  }

  case ENROLL_PHASE_WRITING: {
    bool ok = this->nfc.changeKey(
        this->apiEnrollNewCardData.keyNo, this->nfc.getFactoryKey(),
        this->nfc.getFactoryKey(), this->apiEnrollNewCardData.keyBytes,
        INfc::CARD_KEY_VERSION_ENROLLED);
    this->api.sendEnrollNewCard(ok);
    if (ok) {
      this->beeper.successBeep();
      Display::enrollmentScreen.setStatus(EnrollmentScreen::STATUS_SUCCESS);
      this->enrollPhase = ENROLL_PHASE_SUCCESS;
    } else {
      this->beeper.errorBeep();
      Display::enrollmentScreen.setStatus(EnrollmentScreen::STATUS_ERROR);
      Display::enrollmentScreen.setStatusMessage(
          "Karte konnte nicht\ngeschrieben werden");
      this->enrollPhase = ENROLL_PHASE_ERROR;
    }
    this->enrollPhaseChangedMs = now;
    break;
  }

  case ENROLL_PHASE_SUCCESS: {
    if (now - this->enrollPhaseChangedMs > ENROLL_SUCCESS_DWELL_MS) {
      this->exitEnrollment();
    }
    break;
  }

  case ENROLL_PHASE_ERROR: {
    // Per ATT-503 the screen must not disappear on error. Show it briefly,
    // then drop back to waiting so the user can re-present the card. Re-arm the
    // detection loop so the next (possibly different) card is picked up cleanly.
    if (now - this->enrollPhaseChangedMs > ENROLL_ERROR_DWELL_MS) {
      Display::enrollmentScreen.setStatus(EnrollmentScreen::STATUS_WAITING);
      this->enrollPhase = ENROLL_PHASE_WAIT_FOR_CARD;
      this->enrollCardDetected = false;
      this->nfc.resetCardPresence();
      this->nfc.enableCardDetection();
    }
    break;
  }

  default:
    break;
  }
}

#endif

#ifdef HAS_LVGL_DISPLAY
void Application::beginReset() {
  // Mirrors beginEnrollment(): WAIT_FOR_CARD rides the normal card-detection
  // loop (reliable re-arm across removals); detection is disabled only for the
  // authenticate + write once a card is actually picked.
  this->resetCardDetected = false;
  this->nfc.resetCardPresence();
  this->nfc.enableCardDetection();
  this->resetPhase = RESET_PHASE_WAIT_FOR_CARD;
  this->resetCancelRequested = false;
  this->resetStartTimeMs = millis();
  this->resetPhaseChangedMs = this->resetStartTimeMs;

  Display::resetScreen.setUserName(this->apiResetNfcCardData.username);
  Display::resetScreen.setTimeoutTime(this->resetStartTimeMs + RESET_TIMEOUT_MS);
  Display::resetScreen.setStatus(ResetScreen::STATUS_WAITING);
  Display::transitionToScreen(&Display::resetScreen);

  this->state = APPLICATION_STATE_RESET;
  this->externalState = EXTERNAL_STATE_NONE;
}

void Application::exitReset() {
  this->resetPhase = RESET_PHASE_NONE;
  this->externalState = EXTERNAL_STATE_NONE;
  this->unlocked = false;
  // Hand back to the generic screen routing; next processState() iteration
  // re-evaluates and transitions to the correct idle screen.
  this->state = APPLICATION_STATE_INIT;
}

void Application::processReset() {
  uint32_t now = millis();

  // Explicit cancel (device touch button) wins over everything else.
  if (this->resetCancelRequested) {
    this->resetCancelRequested = false;
    this->logger.debug("Reset cancelled by user");
    this->api.sendResetNfcCardCancel();
    this->exitReset();
    return;
  }

  // Overall timeout — but never interrupt the brief success confirmation.
  if (this->resetPhase != RESET_PHASE_SUCCESS &&
      now - this->resetStartTimeMs > RESET_TIMEOUT_MS) {
    this->logger.error("Reset timeout reached");
    this->api.sendResetNfcCardCancel();
    this->exitReset();
    return;
  }

  switch (this->resetPhase) {
  case RESET_PHASE_WAIT_FOR_CARD: {
    // The detection loop flags a card via the card-detection callback; until
    // then there is nothing to do but keep the screen up.
    if (!this->resetCardDetected) {
      break;
    }
    this->resetCardDetected = false;

    // Take exclusive control of the PN532 for the authenticate + write that
    // follow, so the detection loop doesn't probe the card underneath us.
    this->nfc.disableCardDetection();
    Display::resetScreen.setStatus(ResetScreen::STATUS_WRITING);
    this->resetPhase = RESET_PHASE_WRITING;
    this->resetPhaseChangedMs = now;
    break;
  }

  case RESET_PHASE_WRITING: {
    // Authenticate as the (still factory) application master key, then change
    // the stored slot from the card's current key back to the factory key.
    bool ok = this->nfc.changeKey(this->apiResetNfcCardData.keyNo,
                                  this->nfc.getFactoryKey(),
                                  this->apiResetNfcCardData.keyBytes,
                                  this->nfc.getFactoryKey(),
                                  INfc::CARD_KEY_VERSION_FREE);
    this->api.sendResetNfcCard(ok);
    if (ok) {
      this->beeper.successBeep();
      Display::resetScreen.setStatus(ResetScreen::STATUS_SUCCESS);
      this->resetPhase = RESET_PHASE_SUCCESS;
    } else {
      this->beeper.errorBeep();
      Display::resetScreen.setStatus(ResetScreen::STATUS_ERROR);
      Display::resetScreen.setStatusMessage(
          "Karte konnte nicht\nzurückgesetzt werden");
      this->resetPhase = RESET_PHASE_ERROR;
    }
    this->resetPhaseChangedMs = now;
    break;
  }

  case RESET_PHASE_SUCCESS: {
    if (now - this->resetPhaseChangedMs > RESET_SUCCESS_DWELL_MS) {
      this->exitReset();
    }
    break;
  }

  case RESET_PHASE_ERROR: {
    // Keep the screen up briefly, then drop back to waiting so the user can
    // re-present the card. Re-arm detection so the next card is picked cleanly.
    if (now - this->resetPhaseChangedMs > RESET_ERROR_DWELL_MS) {
      Display::resetScreen.setStatus(ResetScreen::STATUS_WAITING);
      this->resetPhase = RESET_PHASE_WAIT_FOR_CARD;
      this->resetCardDetected = false;
      this->nfc.resetCardPresence();
      this->nfc.enableCardDetection();
    }
    break;
  }

  default:
    break;
  }
}
#endif
