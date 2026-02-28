#pragma once

#include "../ports/settings_port.hpp"
#include "../../settings/settings.hpp"

class SettingsAdapter : public ISettingsPort {
public:
  void setup() override { Settings::setup(); }
  app::contracts::DeviceConfig getDeviceConfig() override {
    DeviceConfig cfg = Settings::getDeviceConfig();
    app::contracts::DeviceConfig out;
    out.passCode = cfg.passCode;
    out.beeperEnabled = cfg.beeperEnabled;
    return out;
  }
  app::contracts::AttraccessApiConfig getAttraccessApiConfig() override {
    AttraccessApiConfig cfg = Settings::getAttraccessApiConfig();
    app::contracts::AttraccessApiConfig out;
    out.hostname = cfg.hostname;
    out.port = cfg.port;
    out.useSSL = cfg.useSSL;
    return out;
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
