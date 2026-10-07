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


void Application::setupApiCallbacks()
{
#ifdef HAS_LVGL_DISPLAY
  this->supervision.setup();
  this->api.onDeviceName(
      [this](std::string deviceName) { Display::setDeviceName(deviceName); });
#endif
#ifdef HAS_LVGL_DISPLAY
  this->api.setUsageStatsCallback([this](const API::UsageStats &stats) {
    lv_lock();
    if (this->unlocked && this->resourceIsSelected && stats.resourceId == this->selectedResourceId &&
        this->cardAuthenticationData.username == this->resourceList.authenticatedUsername)
      Display::resourceDetailsScreen.setUsageStats(stats);
    lv_unlock();
  });
#endif

  this->api.setResourceListUpdateCallback(
      [this](const API::ResourceList &resourceList) {
#ifdef HAS_LVGL_DISPLAY
        lv_lock();
        this->handleResourceListUpdate(resourceList);
        lv_unlock();
#else
        if (resourceList.count > 0) {
          this->selectedResourceId = resourceList.items[0].id;
          this->resourceIsDoor = resourceList.items[0].type == 1;
        }
#endif
      });

#ifdef HAS_WS2812_LED
  this->api.setLedBrightnessChangedCallback(
      [this](uint8_t brightness) { this->led.setBrightness(brightness); });
#endif

  this->api.setCardAuthenticationDetailsResponseCallback(
      [this](API::CardAuthenticationDetailsResponse response) {
#ifdef HAS_LVGL_DISPLAY
        if (!this->cardAuthenticationPending || this->unlocked) return;
#endif
        if (response.error.length() > 0) {
          this->logger.errorf("Authentication failed: %s",
                              response.error.c_str());
          this->beeper.errorBeep();
          this->nfc.enableCardDetection();
#ifdef HAS_LVGL_DISPLAY
          Display::asyncCall([](void *data) { static_cast<Application *>(data)->finishCardAuthentication(false); }, this);
#else
          this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
#endif
          return;
        }

        if (response.keyLen != 16) {
          this->logger.error("Invalid key bytes provided");
          this->beeper.errorBeep();
          this->nfc.enableCardDetection();
#ifdef HAS_LVGL_DISPLAY
          Display::asyncCall([](void *data) { static_cast<Application *>(data)->finishCardAuthentication(false); }, this);
#else
          this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
#endif
          return;
        }

        this->cardAuthenticationData = response;
#ifdef HAS_LVGL_DISPLAY
        if (this->currentProjectsUser != response.username) {
          this->clearProjectSelection();
        }
        this->currentProjectsUser = response.username;
        this->requestProjectsPage(1);
#endif

        this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
      });

}
