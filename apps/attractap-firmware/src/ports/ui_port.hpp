#pragma once

#ifdef HAS_LVGL_DISPLAY

#include "../contracts/api_contracts.hpp"
#include "../contracts/ui_contracts.hpp"

class IUiPort {
public:
  virtual ~IUiPort() = default;

  virtual void setup() = 0;
  virtual void loop() = 0;
  virtual void setDeviceName(const String &deviceName) = 0;
  virtual void showNfcInitErrorPopup(const String &title, const String &message,
                                     std::function<void()> onRetry,
                                     std::function<void()> onReboot) = 0;
  virtual void showErrorPopup(const String &title, const String &message) = 0;
  virtual void showInsufficientBalancePopup(
      std::function<void(uint32_t amountCents)> onStart,
      std::function<void()> onCancel) = 0;
  virtual void transitionToInitScreen() = 0;
  virtual void transitionToConnectionConfigurationScreen() = 0;
  virtual void transitionToSetPinScreen() = 0;
  virtual void transitionToNoResourcesScreen() = 0;
  virtual void transitionToResourceListScreen() = 0;
  virtual void transitionToEnrollmentScreen() = 0;
  virtual void transitionToFirmwareUpdateScreen() = 0;
  virtual void transitionToResourceDetailsScreen() = 0;
  virtual void transitionToLockscreen(std::function<void()> onComplete) = 0;
  virtual void connectionConfigEnablePinLock() = 0;
  virtual void connectionConfigDisablePinLock() = 0;
  virtual void setPinOnConfirmedCallback(
      std::function<void(String)> callback) = 0;
  virtual void connectionConfigOnCancelPinLock(
      std::function<void()> callback) = 0;
  virtual void connectionConfigOnSaveCallback(
      std::function<void(const app::contracts::ConnectionConfig &)>
          callback) = 0;
  virtual void initScreenOnOpenSettings(std::function<void()> callback) = 0;
  virtual void setTouchCallback(
      std::function<void(int16_t, int16_t)> callback) = 0;
  virtual void resourceListSetSelectionCallback(
      std::function<void(const app::contracts::ResourceBrief &)> callback) = 0;
  virtual void
  resourceListSetResourceList(const app::contracts::ResourceList &list) = 0;
  virtual void enrollmentSetUserName(const String &username) = 0;
  virtual void enrollmentSetTimeoutTime(uint32_t timeoutTimeMs) = 0;
  virtual void resourceDetailsSetUserDetails(
      const app::contracts::ResourceDetailsUserDetails &details) = 0;
  virtual void resourceDetailsSetButtonClickCallback(
      std::function<void(app::contracts::ResourceDetailsButtonClickEventData)>
          callback) = 0;
  virtual void resourceDetailsSetProjectsPageRequestCallback(
      std::function<void(uint32_t)> callback) = 0;
  virtual void resourceDetailsSetProjectSelectionCallback(
      std::function<void(uint32_t, const String &)> callback) = 0;
  virtual void resourceDetailsSetFormsSubmitCallback(
      std::function<void(const app::contracts::FormSubmissionList &)> callback) = 0;
  virtual void resourceDetailsSetFormsCancelCallback(
      std::function<void()> callback) = 0;
  virtual void resourceDetailsSetProjects(
      const app::contracts::ProjectsOfUserResponse &projects) = 0;
  virtual void resourceDetailsSetSelectedProject(uint32_t projectId,
                                                 const char *projectName) = 0;
  virtual void resourceDetailsSetResourceAndUsageDetails(
      const app::contracts::ResourceBrief &resource) = 0;
  virtual void resourceDetailsHideActionProgress() = 0;
  virtual void resourceDetailsHideFormsModal() = 0;
  virtual void resourceDetailsShowFormsModal(
      const app::contracts::ResourceUsageFormRequest &request) = 0;
  virtual void resourceDetailsShowActionProgress(const char *message) = 0;
  virtual void resourceDetailsShowSuccessToast(const char *message) = 0;
  virtual void resourceDetailsSetSessionTimeoutTime(uint32_t timeoutTimeMs) = 0;
  virtual void resourceDetailsSetSessionTimeoutPaused(bool paused) = 0;
  virtual void resourceDetailsExtendSessionTimeoutBy(uint32_t deltaMs) = 0;
  virtual void lockscreenSetResourceName(const char *name) = 0;
  virtual void lockscreenSetUsageInfo(bool hasActiveUsage,
                                      const char *activeUser) = 0;
  virtual void firmwareUpdateSetProgress(int progressPct) = 0;
  virtual void firmwareUpdateSetAvailableVersion(const String &version) = 0;
};

#endif
