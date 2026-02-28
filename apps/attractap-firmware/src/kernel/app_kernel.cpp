#include "app_kernel.hpp"

void AppKernel::setup() {
  if (this->initialized) {
    return;
  }

  this->logger.info("Kernel setup start");
  this->appRuntime_.setup();
  this->initialized = true;
  this->logger.info("Kernel setup complete");
}

void AppKernel::loop() { this->appRuntime_.loop(); }

