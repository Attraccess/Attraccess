#pragma once

#include "../contracts/settings_contracts.hpp"

class ISettingsPort {
public:
  virtual ~ISettingsPort() = default;

  virtual void setup() = 0;
  virtual app::contracts::DeviceConfig getDeviceConfig() = 0;
  virtual app::contracts::AttraccessApiConfig getAttraccessApiConfig() = 0;
  virtual void saveNetworkConfig(const String &ssid, const String &password) = 0;
  virtual void saveAttraccessApiConfig(const String &hostname, uint16_t port,
                                       bool useSSL) = 0;
  virtual void setDevicePin(const String &passCode) = 0;
  virtual void setBeeperEnabled(bool enabled) = 0;
};
