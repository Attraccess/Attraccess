#pragma once

#include <Arduino.h>
#include <cstdint>

namespace app::contracts {

struct DeviceConfig {
  String passCode = "0000";
  bool beeperEnabled = true;
};

struct AttraccessApiConfig {
  String hostname = "";
  uint16_t port = 0;
  bool useSSL = false;
};

} // namespace app::contracts
