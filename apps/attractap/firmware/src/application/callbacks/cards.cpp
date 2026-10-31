// Composition root: wires API/NFC/display callbacks, spawns tasks, runs loop
// FEATURE: application

#include "../application.hpp"
#include "../../serial/serialCommandHandler.hpp"
#include "../../platform.hpp"
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

  this->api.setEnrollNewCardSucceededCallback([this]() {
    // Runs on the websocket task; the main loop shows the outcome.
    this->enrollSucceeded = true;
  });

  this->api.setEnrollNewCardErrorCallback([this](std::string error) {
    // Runs on the websocket task. Copy into the fixed buffer, then publish via
    // the volatile flag (set last) so the main loop reads a complete message.
    strlcpy(this->enrollErrorMessage, error.c_str(),
            sizeof(this->enrollErrorMessage));
    this->enrollErrorPending = true;
  });


  Display::enrollmentScreen.setOnCancelCallback(
      [this]() { this->enrollCancelRequested = true; });

  this->api.setResetNfcCardCallback([this](std::string username) {
    this->apiResetNfcCardData.username = username;

    // The reset state machine takes over on the main loop (beginReset()).
    this->externalState = EXTERNAL_STATE_RESET_NFC_CARD;
  });

  this->api.setResetNfcCardResultCallback([this](bool success, std::string error) {
    if (success) {
      this->resetSucceeded = true;
      return;
    }
    strlcpy(this->resetErrorMessage, error.c_str(), sizeof(this->resetErrorMessage));
    this->resetErrorPending = true;
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

  // --- Mass introduction (ATT-1151) -----------------------------------------
  // Server-armed like ATT-816: the flow queues every payload and the main loop
  // decides whether this reader can show the scan screen.
  Display::massIntroductionScreen.setOnCancelCallback(
      [this]() { this->massIntroduction.requestCancel(); });
  this->api.setMassIntroductionStartCallback(
      [this](const API::MassIntroductionStartCommand &command) {
        this->massIntroduction.onStart(command);
      });
  this->api.setMassIntroductionResultCallback(
      [this](const API::MassIntroductionResult &result) {
        this->massIntroduction.onResult(result);
      });
  this->api.setMassIntroductionEndCallback(
      [this](const API::MassIntroductionEnd &end) {
        this->massIntroduction.onEnd(end);
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

// Composition root: wires API/NFC/display callbacks, spawns tasks, runs loop
// FEATURE: application

#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#include "esp_task_wdt.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#endif

void Application::setupNfcCallbacks()
{
  this->api.setCardConversationStartCallback([this]() {
    this->sessionEndNotifyAtMs = 0; // a new card replaces the verified user on the server
    return this->cardRelay.begin(millis());
  });
  this->api.setCardApduCallback(
      [this](uint32_t detectionId, const char *id, uint32_t seq, const uint8_t *apdu, uint8_t length) {
        this->cardRelay.onApdu(detectionId, id, seq, apdu, length);
      });
  this->api.setCardConversationEndCallback(
      [this](uint32_t detectionId, const char *id) { this->cardRelay.onConversationEnd(detectionId, id); });

  auto cardDetectionCallback = [this](uint8_t *uid, uint8_t uidLength) {
#ifdef HAS_LVGL_DISPLAY
    if (this->sessionSummaryActive) {
      this->sessionSummaryDismissRequested = true;
      return; // consume this presentation; do not authenticate the next member
    }
#endif
    this->logger.infof("Card detected: %s",
                       hexToString(uid, uidLength).c_str());

#ifdef DEMO_MODE
    if (this->demoPendingScanActive) {
        this->demoScanUid = hexToString(uid, uidLength);
        this->demoPendingScanActive = false;
        this->demoPendingScanReady = true;
        return;
    }
#endif

#ifndef HAS_LVGL_DISPLAY
    this->cardDetected = true;
    this->cardRemoved = false;
    this->cardPresentationWasLong = false;
    this->cardDetectionTimeMs = millis();
#endif

#ifdef HAS_LVGL_DISPLAY
    if (this->state == APPLICATION_STATE_LOCKED || this->state == APPLICATION_STATE_RESOURCE_LIST)
#else
    if (this->state == APPLICATION_STATE_WAIT_FOR_CARD)
#endif
    {
#ifdef HAS_LVGL_DISPLAY
      if (this->cardAuthenticationPending || this->resourceCount == 0) return;
      this->cardAuthenticationPending = true;
      this->cardAuthenticationStartedAt = millis();
      this->authenticationResourceId = this->resourceIsSelected ? this->selectedResourceId : this->resourceList.items[0].id;
      lv_lock();
      // A repeated scan by the same user must not reuse access from an earlier
      // login while the new personalized list is still loading.
      this->resourceList.authenticatedUsername[0] = '\0';
      for (uint16_t i = 0; i < this->resourceList.count; ++i) this->resourceList.items[i].accessKnown = false;
      this->resourceListUpdated = true;
      this->selectedResourceChanged = true;
      if (this->resourceIsSelected) Display::lockscreen.showActionProgress();
      else Display::resourceListScreen.showActionProgress(FirmwareI18n::Message::CheckingCard, FirmwareI18n::Message::OneMoment);
      lv_unlock();
      this->api.sendCardDetected("tap", uid, uidLength, this->authenticationResourceId);
#else
      this->api.sendCardDetected("tap", uid, uidLength, this->selectedResourceId);
#endif
      return;
    }

#ifdef HAS_LVGL_DISPLAY
    if (this->state == APPLICATION_STATE_ENROLLMENT) {
      // A card entered the field while waiting to enroll. Flag it; the
      // enrollment state machine announces it to the server, which writes the
      // key through the relay. We ride the normal detection loop here precisely
      // because it re-arms the reader reliably across removals/re-presentations
      // (ATT-503).
      memcpy(this->enrollCardUid, uid, uidLength > sizeof(this->enrollCardUid) ? sizeof(this->enrollCardUid) : uidLength);
      this->enrollCardUidLength = uidLength > sizeof(this->enrollCardUid) ? sizeof(this->enrollCardUid) : uidLength;
      this->enrollCardDetected = true;
      return;
    }

    if (this->state == APPLICATION_STATE_RESET) {
      // A card entered the field while waiting to reset. Same rationale as
      // enrollment: flag it; the reset state machine announces it to the
      // server, which writes the factory key back through the relay.
      memcpy(this->resetCardUid, uid, uidLength > sizeof(this->resetCardUid) ? sizeof(this->resetCardUid) : uidLength);
      this->resetCardUidLength = uidLength > sizeof(this->resetCardUid) ? sizeof(this->resetCardUid) : uidLength;
      this->resetCardDetected = true;
      return;
    }

    if (this->state == APPLICATION_STATE_SUPERVISION) {
      this->supervision.onCardDetected(uid, uidLength);
      return;
    }

    if (this->state == APPLICATION_STATE_MASS_INTRODUCTION) {
      this->massIntroduction.onCardDetected(uid, uidLength);
      return;
    }
#endif

  };
  this->nfc.setCardDetectionCallback(cardDetectionCallback);

#ifndef HAS_LVGL_DISPLAY
  this->nfc.setCardRemovalCallback([this](uint32_t presentationTimeMs) {
    this->logger.debugf("Card removed after %d ms", presentationTimeMs);
    this->cardRemoved = true;

    // log inmportant vars (cardDetected, cardRemoved, cardPresentationTimeMs,
    // state)
    this->logger.debugf("cardDetected: %d", this->cardDetected);
    this->logger.debugf("cardRemoved: %d", this->cardRemoved);
    this->logger.debugf("unlocked: %d", this->unlocked);
    this->logger.debugf("state: %d", this->state);
  });
#endif

}

// Composition root: wires API/NFC/display callbacks, spawns tasks, runs loop
// FEATURE: application

#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#include "esp_task_wdt.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#endif

void Application::setupFormCallbacks()
{
#ifdef HAS_LVGL_DISPLAY
  this->api.setResourceFormsRequestCallback(
      [this](const API::ResourceUsageFormRequest &request) {
        // DO NOT copy the large struct here - websocket task has limited
        // stack/heap. Queue only its identity; LVGL validates it against the
        // pending action before copying the complete request metadata.
        struct Payload {
          Application *self;
          uint32_t resourceId;
          uint32_t requestId;
          API::ResourceUsageFormActionType action;
        };
        Payload *payload = new Payload{this, request.resourceId, request.requestId, request.action};
        if (!payload) {
          return;
        }
        Display::asyncCall(
            [](void *u) {
              auto *payload = static_cast<Payload *>(u);
              if (payload && payload->self) {
                // The scratch buffer can hold a newer request by the time this
                // runs, so only process the request represented by this payload.
                const auto &request = payload->self->api.getFormRequestScratch();
                if (request.resourceId == payload->resourceId && request.requestId == payload->requestId &&
                    request.action == payload->action && payload->self->api.isCurrentResourceAction(request.requestId)) {
                  payload->self->handleFormsRequest(request);
                }
              }
              delete payload;
            },
            payload);
      });

  this->api.setResourceFormFieldsCallback(
      [this](const API::ResourceUsageFormFieldsPage &page) {
        (void)page; // The data is in api.getFormFieldsScratch()
        this->pendingFormFieldsReady = true;
        Display::asyncCall(
            [](void *u) {
              auto *self = static_cast<Application *>(u);
              if (self && self->pendingFormFieldsReady) {
                self->pendingFormFieldsReady = false;
                self->pendingFormFields = self->api.getFormFieldsScratch();
                self->handleFormFields(self->pendingFormFields);
              }
            },
            this);
      });

  this->api.setResourceFormPageResultCallback(
      [this](const API::ResourceUsageFormPageResult &result) {
        (void)result; // The data is in api.getFormPageResultScratch()
        this->pendingFormPageResultReady = true;
        Display::asyncCall(
            [](void *u) {
              auto *self = static_cast<Application *>(u);
              if (self && self->pendingFormPageResultReady) {
                self->pendingFormPageResultReady = false;
                self->pendingFormPageResult = self->api.getFormPageResultScratch();
                self->handleFormPageResult(self->pendingFormPageResult);
              }
            },
            this);
      });
#endif
}
