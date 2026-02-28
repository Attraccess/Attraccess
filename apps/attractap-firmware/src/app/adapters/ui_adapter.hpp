#pragma once

#ifdef HAS_LVGL_DISPLAY

#include "translators/api_contracts_translator.hpp"
#include "../ports/ui_port.hpp"

class UiAdapter : public IUiPort {
public:
  void setup() override { Display::setup(); }
  void loop() override { Display::loop(); }
  void setDeviceName(const String &deviceName) override {
    Display::setDeviceName(deviceName);
  }
  void showNfcInitErrorPopup(const String &title, const String &message,
                             std::function<void()> onRetry,
                             std::function<void()> onReboot) override {
    Display::showNfcInitErrorPopup(title, message, onRetry, onReboot);
  }
  void showErrorPopup(const String &title, const String &message) override {
    Display::showErrorPopup(title, message);
  }
  void showInsufficientBalancePopup(
      std::function<void(uint32_t amountCents)> onStart,
      std::function<void()> onCancel) override {
    Display::showInsufficientBalancePopup(onStart, onCancel);
  }
  void transitionToInitScreen() override {
    Display::transitionToScreen(&Display::initScreen);
  }
  void transitionToConnectionConfigurationScreen() override {
    Display::transitionToScreen(&Display::connectionConfigurationScreen);
  }
  void transitionToSetPinScreen() override {
    Display::transitionToScreen(&Display::setPinScreen);
  }
  void transitionToNoResourcesScreen() override {
    Display::transitionToScreen(&Display::noResourcesScreen);
  }
  void transitionToResourceListScreen() override {
    Display::transitionToScreen(&Display::resourceListScreen);
  }
  void transitionToEnrollmentScreen() override {
    Display::transitionToScreen(&Display::enrollmentScreen);
  }
  void transitionToFirmwareUpdateScreen() override {
    Display::transitionToScreen(&Display::firmwareUpdateScreen);
  }
  void transitionToResourceDetailsScreen() override {
    Display::transitionToScreen(&Display::resourceDetailsScreen);
  }
  void transitionToLockscreen(std::function<void()> onComplete) override {
    Display::transitionToScreen(&Display::lockscreen, onComplete);
  }
  void connectionConfigEnablePinLock() override {
    Display::connectionConfigurationScreen.enablePinLock();
  }
  void connectionConfigDisablePinLock() override {
    Display::connectionConfigurationScreen.disablePinLock();
  }
  void setPinOnConfirmedCallback(
      std::function<void(String)> callback) override {
    Display::setPinScreen.setOnPinConfirmedCallback(callback);
  }
  void connectionConfigOnCancelPinLock(
      std::function<void()> callback) override {
    Display::connectionConfigurationScreen.setOnCancelPinLockCallback(callback);
  }
  void connectionConfigOnSaveCallback(
      std::function<void(const ConnectionConfigurationScreen::ConnectionConfig &)>
          callback) override {
    Display::connectionConfigurationScreen.setOnSaveCallback(callback);
  }
  void initScreenOnOpenSettings(std::function<void()> callback) override {
    Display::initScreen.setOnOpenSettingsCallback(callback);
  }
  void setTouchCallback(
      std::function<void(int16_t, int16_t)> callback) override {
    Display::setTouchCallback(callback);
  }
  void resourceListSetSelectionCallback(
      std::function<void(const app::contracts::ResourceBrief &)> callback)
      override {
    Display::resourceListScreen.setResourceSelectionCallback(
        [callback](const API::ResourceBrief &resource) {
          callback(app::adapters::translators::toContract(resource));
        });
  }
  void resourceListSetResourceList(
      const app::contracts::ResourceList &list) override {
    API::ResourceList legacy = app::adapters::translators::toLegacy(list);
    Display::resourceListScreen.setResourceList(legacy);
  }
  void enrollmentSetUserName(const String &username) override {
    Display::enrollmentScreen.setUserName(username);
  }
  void enrollmentSetTimeoutTime(uint32_t timeoutTimeMs) override {
    Display::enrollmentScreen.setEnrollmentTimeoutTime(timeoutTimeMs);
  }
  void resourceDetailsSetUserDetails(
      const ResourceDetailsScreen::UserDetails &details) override {
    Display::resourceDetailsScreen.setUserDetails(details);
  }
  void resourceDetailsSetButtonClickCallback(
      std::function<void(ResourceDetailsScreen::ButtonClickEventData)>
          callback) override {
    Display::resourceDetailsScreen.setButtonClickCallback(callback);
  }
  void resourceDetailsSetProjectsPageRequestCallback(
      std::function<void(uint32_t)> callback) override {
    Display::resourceDetailsScreen.setProjectsPageRequestCallback(callback);
  }
  void resourceDetailsSetProjectSelectionCallback(
      std::function<void(uint32_t, const String &)> callback) override {
    Display::resourceDetailsScreen.setProjectSelectionCallback(callback);
  }
  void resourceDetailsSetFormsSubmitCallback(
      std::function<void(const app::contracts::FormSubmissionList &)> callback)
      override {
    Display::resourceDetailsScreen.setFormsSubmitCallback(
        [callback](const API::FormSubmissionList &list) {
          callback(app::adapters::translators::toContract(list));
        });
  }
  void resourceDetailsSetFormsCancelCallback(
      std::function<void()> callback) override {
    Display::resourceDetailsScreen.setFormsCancelCallback(callback);
  }
  void resourceDetailsSetProjects(
      const app::contracts::ProjectsOfUserResponse &projects) override {
    API::ProjectsOfUserResponse legacy =
        app::adapters::translators::toLegacy(projects);
    Display::resourceDetailsScreen.setProjects(legacy);
  }
  void resourceDetailsSetSelectedProject(uint32_t projectId,
                                         const char *projectName) override {
    Display::resourceDetailsScreen.setSelectedProject(projectId, projectName);
  }
  void resourceDetailsSetResourceAndUsageDetails(
      const app::contracts::ResourceBrief &resource) override {
    API::ResourceBrief legacy = app::adapters::translators::toLegacy(resource);
    Display::resourceDetailsScreen.setResourceAndUsageDetails(legacy);
  }
  void resourceDetailsHideActionProgress() override {
    Display::resourceDetailsScreen.hideActionProgress();
  }
  void resourceDetailsHideFormsModal() override {
    Display::resourceDetailsScreen.hideFormsModal();
  }
  void resourceDetailsShowFormsModal(
      const app::contracts::ResourceUsageFormRequest &request) override {
    API::ResourceUsageFormRequest legacy =
        app::adapters::translators::toLegacy(request);
    Display::resourceDetailsScreen.showFormsModal(legacy);
  }
  void resourceDetailsShowActionProgress(const char *message) override {
    Display::resourceDetailsScreen.showActionProgress(message);
  }
  void resourceDetailsShowSuccessToast(const char *message) override {
    Display::resourceDetailsScreen.showSuccessToast(message);
  }
  void resourceDetailsSetSessionTimeoutTime(uint32_t timeoutTimeMs) override {
    Display::resourceDetailsScreen.setSessionTimeoutTime(timeoutTimeMs);
  }
  void resourceDetailsSetSessionTimeoutPaused(bool paused) override {
    Display::resourceDetailsScreen.setSessionTimeoutPaused(paused);
  }
  void resourceDetailsExtendSessionTimeoutBy(uint32_t deltaMs) override {
    Display::resourceDetailsScreen.extendSessionTimeoutBy(deltaMs);
  }
  void lockscreenSetResourceName(const char *name) override {
    Display::lockscreen.setResourceName(name);
  }
  void lockscreenSetUsageInfo(bool hasActiveUsage,
                              const char *activeUser) override {
    Display::lockscreen.setUsageInfo(hasActiveUsage, activeUser);
  }
  void firmwareUpdateSetProgress(int progressPct) override {
    Display::firmwareUpdateScreen.setProgress(progressPct);
  }
  void firmwareUpdateSetAvailableVersion(const String &version) override {
    Display::firmwareUpdateScreen.setAvailableVersion(version);
  }
};

#endif
