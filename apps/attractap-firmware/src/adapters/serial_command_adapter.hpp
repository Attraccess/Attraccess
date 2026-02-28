#pragma once

#include "../ports/serial_command_port.hpp"
#include "../serial/serialCommandHandler.hpp"

class SerialCommandAdapter : public ISerialCommandPort {
public:
  void setup() override { SerialCommandHandler::setup(); }
  void loop() override { SerialCommandHandler::loop(); }
};
