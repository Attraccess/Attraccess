#pragma once

#include "../../application/application.hpp"
#include "../../logger/logger.hpp"

class AppKernel {
public:
  void setup();
  void loop();

private:
  Application application;
  Logger logger{"AppKernel"};
  bool initialized = false;
};

