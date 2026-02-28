#pragma once

#include "../ports/system_port.hpp"
#include <Arduino.h>

class SystemAdapter : public ISystemPort {
public:
  uint32_t nowMs() override { return millis(); }
  void delayMs(uint32_t ms) override { delay(ms); }
  void restart() override { ESP.restart(); }
};
