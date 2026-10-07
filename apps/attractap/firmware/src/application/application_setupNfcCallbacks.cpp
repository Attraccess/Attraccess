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


void Application::setupNfcCallbacks()
{
  auto cardDetectionCallback = [this](uint8_t *uid, uint8_t uidLength) {
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
      else Display::resourceListScreen.showActionProgress("Karte wird geprüft", "Einen Moment bitte ...");
      lv_unlock();
      this->api.requestCardAuthenticationData(uid, uidLength, this->authenticationResourceId);
#else
      this->api.requestCardAuthenticationData(uid, uidLength,
                                              this->selectedResourceId);
#endif
      return;
    }

#ifdef HAS_LVGL_DISPLAY
    if (this->state == APPLICATION_STATE_ENROLLMENT) {
      // A card entered the field while waiting to enroll. Flag it; the
      // enrollment state machine picks the writable key on the main loop. We
      // ride the normal detection loop here precisely because it re-arms the
      // reader reliably across removals/re-presentations (ATT-503).
      this->enrollCardDetected = true;
      return;
    }

    if (this->state == APPLICATION_STATE_RESET) {
      // A card entered the field while waiting to reset. Same rationale as
      // enrollment: flag it and let the reset state machine authenticate + write
      // the factory key back on the main loop.
      this->resetCardDetected = true;
      return;
    }

    if (this->state == APPLICATION_STATE_SUPERVISION) {
      this->supervision.onCardDetected(uid, uidLength);
      return;
    }
#endif

    if (this->state == APPLICATION_STATE_AUTHENTICATE_CARD) {
      this->processCardAuthenticationData();
      return;
    }
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
