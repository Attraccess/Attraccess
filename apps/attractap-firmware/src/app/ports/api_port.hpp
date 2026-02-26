#pragma once

#include "../../api/api.hpp"

class IApiPort {
public:
  virtual ~IApiPort() = default;

  virtual void setup() = 0;
  virtual void loop() = 0;
  virtual void setResourceListUpdateCallback(
      std::function<void(const API::ResourceList &)> callback) = 0;
  virtual void requestCardAuthenticationData(uint8_t *uid, uint8_t uidLength,
                                             uint32_t resourceId) = 0;
  virtual void setCardAuthenticationDetailsResponseCallback(
      std::function<void(API::CardAuthenticationDetailsResponse)> callback) = 0;
  virtual void setEnrollNewCardGetAvailableKeyNoCallback(
      std::function<void(String username)> callback) = 0;
  virtual void
  setEnrollNewCardCallback(std::function<void(uint8_t keyNo, String key)>) = 0;
  virtual void sendEnrollNewCardAvailableKeyNo(uint8_t *uid, uint8_t uidLength,
                                               uint8_t keyNo) = 0;
  virtual void sendEnrollNewCard(bool success) = 0;
  virtual void startResourceUsageSession(
      uint32_t resourceId, uint32_t projectId = 0,
      const API::FormSubmissionList *formSubmissions = nullptr) = 0;
  virtual void stopResourceUsageSession(
      uint32_t resourceId,
      const API::FormSubmissionList *formSubmissions = nullptr) = 0;
  virtual void lockDoor(uint32_t resourceId) = 0;
  virtual void unlockDoor(uint32_t resourceId) = 0;
  virtual void unlatchDoor(uint32_t resourceId) = 0;
  virtual void triggerFlowButton(uint32_t resourceId, const char *buttonId) = 0;
  virtual void requestBillingTopup(uint32_t amountCents) = 0;
  virtual void onDeviceName(std::function<void(String)> callback) = 0;
  virtual void disableConnectionAttempts() = 0;
  virtual void enableConnectionAttempts() = 0;
  virtual void setErrorCallback(
      std::function<void(const char *title, const char *message)> callback) = 0;
  virtual void
  setActionResultCallback(std::function<void(const char *type, bool success)>
                              callback) = 0;
  virtual void
  setInsufficientBalanceCallback(std::function<void(bool sumUpEnabled)>) = 0;
  virtual void requestProjectsOfUser(uint32_t page) = 0;
  virtual void setProjectsOfUserResponseCallback(
      std::function<void(const API::ProjectsOfUserResponse &)> callback) = 0;
  virtual void setResourceFormsRequestCallback(
      std::function<void(const API::ResourceUsageFormRequest &)> callback) = 0;
  virtual const API::ResourceUsageFormRequest &getFormRequestScratch() const = 0;
  virtual void setFirmwareUpdateProgressCallback(
      std::function<void(int)> callback) = 0;
  virtual void setFirmwareUpdateMetaCallback(
      std::function<void(String availableVersion)> callback) = 0;
};
