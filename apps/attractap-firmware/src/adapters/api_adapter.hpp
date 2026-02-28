#pragma once

#include "translators/api_contracts_translator.hpp"
#include "../ports/api_port.hpp"

class ApiAdapter : public IApiPort {
public:
  void setup() override { this->api.setup(); }
  void loop() override { this->api.loop(); }
  void setResourceListUpdateCallback(
      std::function<void(const app::contracts::ResourceList &)> callback)
      override {
    this->api.setResourceListUpdateCallback(
        [this, callback](const API::ResourceList &value) {
          app::adapters::translators::toContract(value, this->resourceListScratch);
          callback(this->resourceListScratch);
        });
  }
  void requestCardAuthenticationData(uint8_t *uid, uint8_t uidLength,
                                     uint32_t resourceId) override {
    this->api.requestCardAuthenticationData(uid, uidLength, resourceId);
  }
  void setCardAuthenticationDetailsResponseCallback(
      std::function<void(app::contracts::CardAuthenticationDetails)> callback)
      override {
    this->api.setCardAuthenticationDetailsResponseCallback(
        [callback](API::CardAuthenticationDetailsResponse value) {
          callback(app::adapters::translators::toContract(value));
        });
  }
  void setEnrollNewCardGetAvailableKeyNoCallback(
      std::function<void(String username)> callback) override {
    this->api.setEnrollNewCardGetAvailableKeyNoCallback(callback);
  }
  void
  setEnrollNewCardCallback(std::function<void(uint8_t keyNo, String key)>
                               callback) override {
    this->api.setEnrollNewCardCallback(callback);
  }
  void sendEnrollNewCardAvailableKeyNo(uint8_t *uid, uint8_t uidLength,
                                       uint8_t keyNo) override {
    this->api.sendEnrollNewCardAvailableKeyNo(uid, uidLength, keyNo);
  }
  void sendEnrollNewCard(bool success) override {
    this->api.sendEnrollNewCard(success);
  }
  void startResourceUsageSession(
      uint32_t resourceId, uint32_t projectId,
      const app::contracts::FormSubmissionList *formSubmissions) override {
    if (formSubmissions) {
      API::FormSubmissionList legacy =
          app::adapters::translators::toLegacy(*formSubmissions);
      this->api.startResourceUsageSession(resourceId, projectId, &legacy);
      return;
    }
    this->api.startResourceUsageSession(resourceId, projectId, nullptr);
  }
  void stopResourceUsageSession(
      uint32_t resourceId,
      const app::contracts::FormSubmissionList *formSubmissions) override {
    if (formSubmissions) {
      API::FormSubmissionList legacy =
          app::adapters::translators::toLegacy(*formSubmissions);
      this->api.stopResourceUsageSession(resourceId, &legacy);
      return;
    }
    this->api.stopResourceUsageSession(resourceId, nullptr);
  }
  void lockDoor(uint32_t resourceId) override { this->api.lockDoor(resourceId); }
  void unlockDoor(uint32_t resourceId) override {
    this->api.unlockDoor(resourceId);
  }
  void unlatchDoor(uint32_t resourceId) override {
    this->api.unlatchDoor(resourceId);
  }
  void triggerFlowButton(uint32_t resourceId, const char *buttonId) override {
    this->api.triggerFlowButton(resourceId, buttonId);
  }
  void requestBillingTopup(uint32_t amountCents) override {
    this->api.requestBillingTopup(amountCents);
  }
  void onDeviceName(std::function<void(String)> callback) override {
    this->api.onDeviceName(callback);
  }
  void disableConnectionAttempts() override {
    this->api.disableConnectionAttempts();
  }
  void enableConnectionAttempts() override {
    this->api.enableConnectionAttempts();
  }
  void setErrorCallback(
      std::function<void(const char *title, const char *message)>
          callback) override {
    this->api.setErrorCallback(callback);
  }
  void
  setActionResultCallback(std::function<void(const char *type, bool success)>
                              callback) override {
    this->api.setActionResultCallback(callback);
  }
  void
  setInsufficientBalanceCallback(std::function<void(bool sumUpEnabled)>
                                     callback) override {
    this->api.setInsufficientBalanceCallback(callback);
  }
  void requestProjectsOfUser(uint32_t page) override {
    this->api.requestProjectsOfUser(page);
  }
  void setProjectsOfUserResponseCallback(
      std::function<void(const app::contracts::ProjectsOfUserResponse &)>
          callback)
      override {
    this->api.setProjectsOfUserResponseCallback(
        [this, callback](const API::ProjectsOfUserResponse &value) {
          app::adapters::translators::toContract(value,
                                                 this->projectsOfUserScratch);
          callback(this->projectsOfUserScratch);
        });
  }
  void setResourceFormsRequestCallback(
      std::function<void(const app::contracts::ResourceUsageFormRequest &)>
          callback)
      override {
    this->api.setResourceFormsRequestCallback(
        [this, callback](const API::ResourceUsageFormRequest &value) {
          app::adapters::translators::toContract(
              value, this->resourceUsageFormRequestScratch);
          callback(this->resourceUsageFormRequestScratch);
        });
  }
  void
  setFirmwareUpdateProgressCallback(std::function<void(int)> callback) override {
    this->api.setFirmwareUpdateProgressCallback(callback);
  }
  void setFirmwareUpdateMetaCallback(
      std::function<void(String availableVersion)> callback) override {
    this->api.setFirmwareUpdateMetaCallback(callback);
  }

private:
  API api;
  app::contracts::ResourceList resourceListScratch;
  app::contracts::ProjectsOfUserResponse projectsOfUserScratch;
  app::contracts::ResourceUsageFormRequest resourceUsageFormRequestScratch;
};
