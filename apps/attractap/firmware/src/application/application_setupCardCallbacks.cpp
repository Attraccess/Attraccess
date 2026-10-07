// Composition root: wires API/NFC/display callbacks, spawns tasks, runs loop
// FEATURE: application

#include "application.hpp"
#include "../serial/serialCommandHandler.hpp"
#include "platform.hpp"
#include <cstring>
#include <string>
#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#include "esp_task_wdt.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#endif


void Application::setupCardCallbacks()
{
#ifdef HAS_LVGL_DISPLAY
  this->api.setEnrollNewCardGetAvailableKeyNoCallback([this](std::string username) {
    this->apiEnrollNewCardGetAvailableKeyNoData = {
        username = username,
    };
    this->externalState = EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO;
  });

  this->api.setEnrollNewCardCallback([this](uint8_t keyNo, std::string key) {
    uint8_t keyBytes[16] = {0};
    stringToHexArray(key, keyBytes, 16);

    this->apiEnrollNewCardData.keyNo = keyNo;
    memset(this->apiEnrollNewCardData.keyBytes, 0, 16);
    memcpy(this->apiEnrollNewCardData.keyBytes, keyBytes, 16);

    // Just flag readiness; processEnrollment() performs the write on the main
    // loop while the card is still held (no card-detection edge required).
    this->enrollKeyMaterialReady = true;
  });

  this->api.setEnrollNewCardErrorCallback([this](std::string error) {
    // Runs on the websocket task. Copy into the fixed buffer, then publish via
    // the volatile flag (set last) so the main loop reads a complete message.
    if (error == "CARD_ALREADY_ENROLLED") {
      strlcpy(this->enrollErrorMessage, "Karte ist bereits\nregistriert",
              sizeof(this->enrollErrorMessage));
    } else {
      strlcpy(this->enrollErrorMessage, translateReaderError(error).c_str(),
              sizeof(this->enrollErrorMessage));
    }
    this->enrollErrorPending = true;
  });

  Display::enrollmentScreen.setOnCancelCallback(
      [this]() { this->enrollCancelRequested = true; });

  this->api.setResetNfcCardCallback(
      [this](std::string username, uint8_t keyNo, std::string key) {
        uint8_t keyBytes[16] = {0};
        stringToHexArray(key, keyBytes, 16);

        this->apiResetNfcCardData.username = username;
        this->apiResetNfcCardData.keyNo = keyNo;
        memset(this->apiResetNfcCardData.keyBytes, 0, 16);
        memcpy(this->apiResetNfcCardData.keyBytes, keyBytes, 16);

        // The reset state machine takes over on the main loop (beginReset()).
        this->externalState = EXTERNAL_STATE_RESET_NFC_CARD;
      });

  Display::resetScreen.setOnCancelCallback(
      [this]() { this->resetCancelRequested = true; });

  // --- Two-card supervision (ATT-493) ---------------------------------------
  Display::supervisionScreen.setOnCancelCallback(
      [this]() { this->supervision.requestCancel(); });

  this->api.setSupervisionRequestResultCallback(
      [this](API::SupervisionRequestResult result) {
        this->supervision.onRequestResult(result);
      });

  this->api.setSupervisorCardAuthenticationResponseCallback(
      [this](API::SupervisorCardAuthenticationResponse response) {
        this->supervision.onCardAuthentication(response);
      });

  // Server-armed supervision (ATT-816). The flow queues the websocket payload;
  // the main loop decides whether this reader can enter the screen.
  this->api.setSupervisionStartCallback(
      [this](API::SupervisionStartCommand command) {
        this->supervision.armWebInitiated(command);
      });

  this->api.setSupervisionResolvedCallback(
      [this](API::SupervisionResolvedResult result) {
        this->supervision.onResolved(result);
      });

  this->api.setProjectsOfUserResponseCallback(
      [this](const API::ProjectsOfUserResponse &projectsOfUserResponse) {
        this->projectsOfUserResponse = projectsOfUserResponse;
        this->projectsCurrentPage = projectsOfUserResponse.page;
        this->projectsTotalCount = projectsOfUserResponse.total;
        this->projectsHasMore = projectsOfUserResponse.hasMore;
        this->projectsOfUserResponseUpdated = true;
      });

#endif
}
