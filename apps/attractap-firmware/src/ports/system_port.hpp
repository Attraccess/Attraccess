#pragma once

#include <stdint.h>

class ISystemPort {
public:
  virtual ~ISystemPort() = default;

  virtual uint32_t nowMs() = 0;
  virtual void delayMs(uint32_t ms) = 0;
  virtual void restart() = 0;
};
