#pragma once

#include "../ports/settings_port.hpp"

class SettingsAdapter : public ISettingsPort {
public:
  void setup() override { Settings::setup(); }
  DeviceConfig getDeviceConfig() override { return Settings::getDeviceConfig(); }
  AttraccessApiConfig getAttraccessApiConfig() override {
    return Settings::getAttraccessApiConfig();
  }
  void saveNetworkConfig(const String &ssid, const String &password) override {
    Settings::saveNetworkConfig(ssid, password);
  }
  void saveAttraccessApiConfig(const String &hostname, uint16_t port,
                               bool useSSL) override {
    Settings::saveAttraccessApiConfig(hostname, port, useSSL);
  }
  void setDevicePin(const String &passCode) override {
    Settings::setDevicePin(passCode);
  }
  void setBeeperEnabled(bool enabled) override {
    Settings::setBeeperEnabled(enabled);
  }
};
