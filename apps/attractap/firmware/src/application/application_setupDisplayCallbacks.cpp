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


void Application::setupDisplayCallbacks()
{
#ifdef HAS_LVGL_DISPLAY
  Display::resourceDetailsScreen.setButtonClickCallback(
      [this](ResourceDetailsScreen::ButtonClickEventData evt) {
        this->handleResourceDetailsButtonClick(evt);
      });

  Display::resourceDetailsScreen.setProjectsPageRequestCallback(
      [this](uint32_t page) { this->requestProjectsPage(page); });
  Display::resourceDetailsScreen.setProjectSelectionCallback(
      [this](uint32_t projectId, const std::string &projectName) {
        this->handleProjectSelection(projectId, projectName);
      });
  Display::resourceDetailsScreen.setFormPageNextCallback(
      [this](const API::FormPageSubmission &page) {
        this->handleFormPageNext(page);
      });
  Display::resourceDetailsScreen.setFormPageBackCallback(
      [this]() { this->handleFormPageBack(); });
  Display::resourceDetailsScreen.setFormsCancelCallback(
      [this]() { this->handleFormsCancel(); });

  Display::setPinScreen.setOnPinConfirmedCallback(
      [this](std::string pin) { Settings::setDevicePin(pin); });

  Display::connectionConfigurationScreen.setOnCancelPinLockCallback([this]() {
    Display::transitionToScreen(&Display::initScreen);
    this->state = APPLICATION_STATE_BOOT;
    this->api.enableConnectionAttempts();
  });

  Display::connectionConfigurationScreen.setOnSaveCallback(
      [this](const ConnectionConfigurationScreen::ConnectionConfig &cfg) {
        this->handleConnectionConfigurationSave(cfg);
      });

  Display::connectionConfigurationScreen.setOnResetCertificateCallback(
      [this]() { this->api.resetCertificateTrust(); });

#ifdef HAS_POWER_BUTTON
  Display::connectionConfigurationScreen.setOnPowerOffCallback(
      [this]() { this->ioExpander.powerOff(); });
#endif

  Display::initScreen.setOnOpenSettingsCallback([this]() {
#ifdef DEMO_MODE
    Display::transitionToScreen(&Display::demoSettingsScreen);
#else
    this->state = APPLICATION_STATE_CONFIGURATION_REQUIRED;
    this->api.disableConnectionAttempts();
    Display::connectionConfigurationScreen.enablePinLock();
    Display::transitionToScreen(&Display::connectionConfigurationScreen);
#endif
  });

  // Hidden maintenance drawer (pull down from the top edge)
  Display::setDrawerAvailableCallback([this]() {
    return !this->cardAuthenticationPending && this->pendingUiAction.empty() &&
           !this->waitingForResourceRefresh && !this->hasPendingFormRequest &&
           this->state != APPLICATION_STATE_SUPERVISION;
  });
  Display::setOnOpenSettingsCallback([this]() {
#ifdef DEMO_MODE
    Display::transitionToScreen(&Display::demoSettingsScreen);
#else
    this->state = APPLICATION_STATE_CONFIGURATION_REQUIRED;
    this->api.disableConnectionAttempts();
    Display::connectionConfigurationScreen.enablePinLock();
    Display::transitionToScreen(&Display::connectionConfigurationScreen);
#endif
  });

#ifdef DEMO_MODE
  Display::demoSettingsScreen.setStartScanCallback([this]() {
    this->demoPendingScanActive = true;
    this->demoPendingScanReady = false;
    this->nfc.resetCardPresence();
    this->nfc.enableCardDetection();
  });
  Display::demoSettingsScreen.setCancelScanCallback([this]() {
    this->demoPendingScanActive = false;
    this->demoPendingScanReady = false;
    this->nfc.disableCardDetection();
  });
#ifdef HAS_POWER_BUTTON
  Display::demoSettingsScreen.setPowerOffCallback(
      [this]() { this->ioExpander.powerOff(); });
#endif
#endif

  Display::resourceListScreen.setResourceSelectionCallback(
      [this](const API::ResourceBrief &resource) {
        if (!this->pendingUiAction.empty() || this->waitingForResourceRefresh || this->cardAuthenticationPending) return;
        this->returnToListAfterAction = false;
        this->selectResource(resource);
      });
  Display::resourceListScreen.setActionCallback([this](const API::ResourceBrief &resource, ResourceListAction action) {
    this->handleResourceListAction(resource, action);
  });
  Display::resourceListScreen.setLogoutCallback([this] { this->logoutReader(); });
  Display::lockscreen.setBackCallback([this] {
    if (this->cardAuthenticationPending) return;
    this->resourceIsSelected = false;
    this->selectedResourceId = 0;
  });

  Display::setTouchCallback(
      [this](int16_t x, int16_t y) { this->handleTouch(x, y); });

#endif
}
