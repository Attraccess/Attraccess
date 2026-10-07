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
